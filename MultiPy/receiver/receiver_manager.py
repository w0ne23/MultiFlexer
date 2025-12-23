import json
import threading
import ssl
import socketio
import time
from gi.repository import GLib
from PyQt5 import QtCore

from config import SIGNALING_URL, RECEIVER_NAME, UI_OVERLAY_DELAY_MS
from peer_receiver import PeerReceiver

TIMEOUT_SECONDS = 180

class MultiReceiverManager:
    def __init__(self, ui_window, view_manager=None, mqtt_manager=None):
        self.ui = ui_window
        self.view_manager = view_manager
        self.mqtt_manager = mqtt_manager
        self.sio = socketio.Client(
            logger=False,
            engineio_logger=False,
            ssl_verify=False,
            websocket_extra_options={"sslopt": {"cert_reqs": ssl.CERT_NONE}},
        )
        self.peers = {}          # sender_id -> PeerReceiver
        self._order = []         # 등록 순서 유지

        # 현재 레이아웃에서 어떤 셀에 어떤 sender가 들어가 있는지
        self._cell_assign: dict[int, str] = {}   # cell_index -> sender_id

        self._bind_socket_events()

        if self.view_manager:
            self.view_manager.bind_manager(self)
            self.view_manager.set_senders_provider(self.list_active_senders)

        self._install_time_label()

        # NEW: 자동 종료 타이머 관련 변수
        self._first_frame_received_flag = False
        self._termination_timer_id = None
    # NEW: 첫 프레임 수신 시 호출되는 콜백
    def _on_any_peer_first_frame(self, sender_id: str):
        # 타이머는 한 번만 시작합니다.
        if self._first_frame_received_flag:
            return
        
        self._first_frame_received_flag = True
        peer = self.peers.get(sender_id)
        sender_name = peer.sender_name if peer else sender_id
        
        print(f"[Timer] 첫 프레임 수신 ({sender_name}). {TIMEOUT_SECONDS // 60}분 후 자동 종료 타이머 시작.")
        
        # GLib 타이머 추가 (TIMEOUT_SECONDS 후 _terminate_program 호출)
        self._termination_timer_id = GLib.timeout_add_seconds(
            TIMEOUT_SECONDS, 
            self._terminate_program
        )

    # NEW: 프로그램 종료 로직
    def _terminate_program(self):
        print(f"[Timer] {TIMEOUT_SECONDS // 60}분이 경과하여 프로그램을 자동 종료합니다.")
        
        # GStreamer/GLib 메인 루프를 종료하여 애플리케이션을 닫습니다.
        try:
            loop = GLib.MainLoop.get_current()
            if loop and loop.is_running():
                loop.quit()
        except Exception as e:
            print(f"GLib.MainLoop 종료 실패: {e}")
            # PyQt 응용 프로그램도 종료 시도
            QtCore.QCoreApplication.quit()
        
        # GLib 타이머를 제거하기 위해 False 반환
        return False
        
    @staticmethod
    def _qt(callable_):
        QtCore.QTimer.singleShot(0, callable_)

    def start(self):
        threading.Thread(target=self._sio_connect, daemon=True).start()

    def stop(self):
        try:
            for sid, peer in list(self.peers.items()):
                peer.stop()
                # 안전 정리
                try:
                    del self.peers[sid]
                except Exception:
                    pass
        except Exception:
            pass
        try:
            if self.sio.connected:
                self.sio.disconnect()
        except Exception:
            pass

    # ----- 상태 쿼리 -----
    def _active_sender_ids(self):
        return [sid for sid, p in self.peers.items() if p.share_active]

    def list_active_senders(self):
        return [(sid, p.sender_name) for sid, p in self.peers.items()]

    # ----- 모드 전환/셀 배정 보조 -----
    def pause_all_streams(self):
        self._cell_assign.clear()

    def assign_sender_to_cell(self, cell_index: int, sender_id: str):
        if sender_id not in self.peers or not (0 <= cell_index):
            return
        target = self.peers[sender_id]

        # 동일 sender가 다른 셀에 이미 있으면 제거
        for idx, sid in list(self._cell_assign.items()):
            if sid == sender_id and idx != cell_index:
                try:
                    if self.view_manager and 0 <= idx < len(self.view_manager.cells):
                        self.view_manager.cells[idx].clear()
                except Exception:
                    pass
                self._cell_assign.pop(idx, None)

        # 기존 셀에 다른 sender가 있었다면 제거
        prev_sid = self._cell_assign.get(cell_index)
        if prev_sid and prev_sid != sender_id:
            self._cell_assign.pop(cell_index, None)

        def _ensure_and_put():
            w = self.ui.ensure_widget(sender_id, target.sender_name)
            if w and self.view_manager and 0 <= cell_index < len(self.view_manager.cells):
                try:
                    w.setParent(None)
                except Exception:
                    pass
                self.view_manager.cells[cell_index].put_widget(w)
                if not w.isVisible():
                    w.show()
                GLib.idle_add(target.update_window_from_widget, w)

                def _rebind():
                    target.resume_pipeline()
                    target._force_overlay_handle()
                    return False
                GLib.timeout_add(UI_OVERLAY_DELAY_MS, _rebind)
            return False
        GLib.idle_add(_ensure_and_put)

        self._cell_assign[cell_index] = sender_id

    def _sio_connect(self):
        try:
            self.sio.connect(SIGNALING_URL, transports=['websocket'])
            self.sio.wait()
        except Exception as e:
            print("[SIO] connect error:", e, flush=True)

    def _bind_socket_events(self):
        @self.sio.event
        def connect():
            print("[SIO] connected:", self.sio.sid, flush=True)
            self.sio.emit(
                'join-room',
                {'role': 'receiver', 'name': RECEIVER_NAME},
                callback=lambda ack: print("[SIO] join-room ack:", ack, flush=True),
            )

        @self.sio.on('sender-list')
        def on_sender_list(sender_arr):
            print("[SIO] sender-list:", sender_arr, flush=True)
            alive = {s.get('id') for s in (sender_arr or []) if s.get('id')}
            for sid in list(self.peers.keys()):
                if sid not in alive:
                    self._pause_sender(sid, reason="list-diff")

            if not sender_arr:
                return

            if not getattr(self.ui, "_first_sender_connected", False):
                self.ui._first_sender_connected = True
                QtCore.QTimer.singleShot(0, self.ui.enter_sender_mode)

            for s in sender_arr:
                sid = s.get('id')
                name = s.get('name', sid)
                if not sid:
                    continue

                if sid in self.peers:
                    if sid not in self._order:
                        self._order.append(sid)
                    continue

                GLib.idle_add(self.ui.ensure_widget, sid, name)
                peer = PeerReceiver(
                    self.sio, sid, name, self.ui,
                    on_ready=None,
                    on_down=lambda x, reason="ice", **_: self._remove_sender(x, reason=reason),
                    mqtt_manager=self.mqtt_manager,
                    on_first_frame_callback=self._on_any_peer_first_frame
                )
                self.peers[sid] = peer
                if sid not in self._order:
                    self._order.append(sid)

                GLib.idle_add(peer.prepare_window_handle)
                peer.start()
                GLib.idle_add(lambda p=peer: (p._ensure_transceivers(), p._maybe_create_offer()))
                self.sio.emit('share-request', {'to': sid})
                print(f"[SIO] share-request → {sid} ({name})", flush=True)

                self._notify_mqtt_change()

        @self.sio.on('sender-share-started')
        def on_sender_share_started(data):
            sid  = data.get('id') or data.get('senderId') or data.get('from')
            name = data.get('name')
            if not sid:
                return

            if sid not in self.peers:
                self._qt(lambda: self.ui.ensure_widget(sid, name or sid))
                peer = PeerReceiver(
                    self.sio, sid, name or sid, self.ui,
                    on_ready=None,
                    on_down=lambda x, reason="ice", **_: self._pause_sender(x, reason=reason),
                    mqtt_manager=self.mqtt_manager,
                    on_first_frame_callback=self._on_any_peer_first_frame
                )
                self.peers[sid] = peer
                if sid not in self._order:
                    self._order.append(sid)
                self._qt(peer.prepare_window_handle)
                peer.start()
                self._qt(lambda p=peer: (p._ensure_transceivers(), p._maybe_create_offer()))

            peer = self.peers[sid]
            peer.share_active = True
            GLib.idle_add(lambda p=peer: (p.resume_pipeline(), False)[1])
            GLib.timeout_add(UI_OVERLAY_DELAY_MS, lambda p=peer: (p._force_overlay_handle(), False)[1])

            if getattr(self, "mqtt_manager", None):
                self.mqtt_manager.publish("participant/update",
                                          json.dumps(self.get_active_senders()))

            if not self._cell_assign:
                def _show_now():
                    w = self.ui.ensure_widget(sid, name or peer.sender_name)
                    if w and not w.isVisible():
                        w.show()
                    self.ui.set_active_sender_name(sid, name or peer.sender_name)
                    peer.update_window_from_widget(w)
                self._qt(_show_now)

                def _enter_single_mode_and_assign():
                    if self.view_manager and self.view_manager.mode != 1:
                        self.view_manager.set_mode(1)
                    def _try_assign():
                        if not self.view_manager or not self.view_manager.cells:
                            QtCore.QTimer.singleShot(0, _try_assign)
                            return
                        self.assign_sender_to_cell(0, sid)
                    QtCore.QTimer.singleShot(0, _try_assign)
                QtCore.QTimer.singleShot(50, _enter_single_mode_and_assign)

            print(f"[SIO] sender-share-started: {peer.sender_name}", flush=True)

        @self.sio.on('sender-share-stopped')
        def on_sender_share_stopped(data):
            sid = data.get('id') or data.get('senderId') or data.get('from')
            if not sid:
                return
            peer = self.peers.get(sid)
            if not peer:
                return

            GLib.idle_add(lambda p=peer: (p.pause("share-stopped"), False)[1])
            for idx, s in list(self._cell_assign.items()):
                if s == sid:
                    try:
                        if self.view_manager and 0 <= idx < len(self.view_manager.cells):
                            self.view_manager._set_focus(idx)
                    except Exception:
                        pass
                    self._cell_assign.pop(idx, None)

            GLib.idle_add(self.ui.remove_sender_widget, sid)
            print(f"[SIO] sender-share-stopped: {peer.sender_name}", flush=True)

        @self.sio.on('signal')
        def on_signal(data):
            typ, frm, payload = data.get('type'), data.get('from'), data.get('payload')
            print("[SIO] signal recv:", typ, "from", frm, flush=True)
            if typ in ('bye', 'hangup', 'close'):
                if frm:
                    self._remove_sender(frm, reason=typ)
                return

            if not frm or frm not in self.peers:
                print("[SIO] unknown sender in signal:", frm, flush=True)
                return
            peer = self.peers[frm]

            if typ == 'answer' and payload:
                sdp_text = payload['sdp'] if isinstance(payload, dict) else payload
                GLib.idle_add(peer.apply_remote_answer, sdp_text)
            elif typ == 'candidate' and payload:
                cand  = payload.get('candidate')
                mline = int(payload.get('sdpMLineIndex') or 0)
                if cand is not None:
                    GLib.idle_add(peer.webrtc.emit, 'add-ice-candidate', mline, cand)

        @self.sio.on('remove-sender')
        def on_remove_sender(sid):
            if not sid:
                return
            self._remove_sender(sid, reason="server-remove")

        @self.sio.on('sender-disconnected')
        def on_sender_disconnected(data):
            sid = data.get('id') or data.get('senderId') or data.get('from')
            print(f"[SIO] sender-disconnected 수신: raw={data}, sid={sid}", flush=True)
            try:
                if sid:
                    self._pause_sender(sid, reason="disconnected")
            except Exception as e:
                print(f"[SIO][ERROR] pause_sender 실패: sid={sid}, err={e}", flush=True)

        @self.sio.on('sender-left')
        def on_sender_left(data):
            sid = data.get('id') or data.get('senderId') or data.get('from')
            if sid:
                self._pause_sender(sid, reason="left")
                peer = self.peers.get(sid)
                print(f"[!!!!!] sender-left: sid={sid}, name={peer.sender_name if peer else 'unknown'}", flush=True)

        @self.sio.on('room-deleted')
        def on_room_deleted(_=None):
            print("[SIO] room-deleted → all cleanup", flush=True)
            for sid in list(self.peers.keys()):
                self._remove_sender(sid, reason="room-deleted")

        # --------- 프레임 타임스탬프(100프레임마다) 수신 → 해당 피어로 전달 ----------
        @self.sio.on("frame-ts")
        def on_frame_ts(data):
            try:
                sid = data.get("from")
                ts  = data.get("ts_ms")
                seq = data.get("seq")
                if not sid or ts is None or seq is None:
                    print("[SIO][frame-ts] drop: invalid payload", data, flush=True)
                    return
                peer = self.peers.get(sid)
                if peer is None:
                    print(f"[SIO][frame-ts] no peer for sid={sid} seq={seq}", flush=True)
                    return
                # 핵심: PeerReceiver로 전달하여 지연 계산이 가능해짐
                peer.update_tx_meta(int(seq), float(ts))
                # 디버그 추적
                if int(seq) % 100 == 0:
                    print(f"[SIO][frame-ts] -> peer[{sid}] seq={seq} ts={ts}", flush=True)
            except Exception as e:
                print("[SIO][frame-ts] err:", e, flush=True)

    def _pause_sender(self, sid: str, reason: str = ""):
        peer = self.peers.get(sid)
        if not peer:
            return
        GLib.idle_add(lambda p=peer, r=reason: (p.pause(r), False)[1])
        peer.share_active = False

        if getattr(self, "mqtt_manager", None):
            self.mqtt_manager.publish("participant/left",
                                      json.dumps({"id": sid, "name": peer.sender_name}))
            self.mqtt_manager.publish("participant/update",
                                      json.dumps(self.get_active_senders()))

        for idx, s in list(self._cell_assign.items()):
            if s == sid:
                try:
                    if self.view_manager and 0 <= idx < len(self.view_manager.cells):
                        self.view_manager.cells[idx].clear()
                except Exception:
                    pass
                self._cell_assign.pop(idx, None)
        GLib.idle_add(self.ui.remove_sender_widget, sid)

    def _remove_sender(self, sid: str, reason: str = ""):
        if sid not in self.peers:
            return
        name = self.peers[sid].sender_name
        print(f"[CLEANUP] remove sender {name} ({reason})", flush=True)
        peer = self.peers.pop(sid, None)
        try:
            if peer:
                peer.stop()
        except Exception:
            pass

        for idx, s in list(self._cell_assign.items()):
            if s == sid:
                try:
                    if self.view_manager and 0 <= idx < len(self.view_manager.cells):
                        self.view_manager.cells[idx].clear()
                except Exception:
                    pass
                self._cell_assign.pop(idx, None)

        try:
            self._order.remove(sid)
        except ValueError:
            pass

        GLib.idle_add(self.ui.remove_sender_widget, sid)
        self._notify_mqtt_change()

        if not self.peers:
            def _reset_to_landing():
                self.ui._main.setCurrentIndex(0)
                self.ui._stack.setCurrentWidget(self.ui._landing)
                self.ui.enter_landing_mode()
                self.ui._first_sender_connected = False
            QtCore.QTimer.singleShot(0, _reset_to_landing)

    def _notify_mqtt_change(self):
        if getattr(self, "mqtt_manager", None):
            all_senders = self.get_all_senders()
            self.mqtt_manager.publish("participant/update", json.dumps(all_senders))

    def get_all_senders_name(self):
        return [self.peers[sid].sender_name for sid, peer in self.peers.items()]

    def get_all_senders(self):
        return [{"id": sid, "name": peer.sender_name, "active": peer.share_active}
                for sid, peer in self.peers.items()]

    def get_active_senders(self):
        return [{"id": sid, "name": self.peers[sid].sender_name}
                for sid in self._active_sender_ids()]

    # ---------------- 키보드 입력 / 절대시계 표시 ----------------
    def _install_time_label(self):
        """키보드 이벤트 감지 및 시계 라벨 생성"""
        try:
            self._time_label = QtCore.QLabel(self.ui)
            self._time_label.setStyleSheet(
                "color: white; background-color: rgba(0,0,0,100);"
                "font-size: 10pt; padding: 2px;"
            )
            self._time_label.setAlignment(QtCore.Qt.AlignLeft | QtCore.Qt.AlignBottom)
            self._time_label.setGeometry(10, self.ui.height() - 30, 180, 20)
            self._time_label.hide()

            self._time_visible = False
            self.ui.installEventFilter(self)
        except Exception:
            pass

    def eventFilter(self, obj, event):
        """키보드 이벤트 처리 (t 키로 시계 토글)"""
        if event.type() == QtCore.QEvent.KeyPress and event.key() == QtCore.Qt.Key_T:
            self._toggle_time_label()
            return True
        return False

    def _toggle_time_label(self):
        """t 키로 시계 표시/숨김 토글"""
        if not hasattr(self, "_time_visible"):
            self._time_visible = False

        if self._time_visible:
            self._time_label.hide()
            self._time_visible = False
        else:
            now_ms = int(time.time() * 1000)
            self._time_label.setText(f"{now_ms} ms")
            self._time_label.show()
            self._time_visible = True
