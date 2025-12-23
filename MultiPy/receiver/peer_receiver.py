# peer_receiver.py
# WebRTC 피어 수신기 클래스 (통계 루프를 별도 스레드로 분리)

import gi, json, time, sys, threading

gi.require_version('Gst', '1.0')
gi.require_version('GstWebRTC', '1.0')
gi.require_version('GstSdp', '1.0')
gi.require_version('GstVideo', '1.0')

from datetime import datetime
from zoneinfo import ZoneInfo

from gi.repository import Gst, GstWebRTC, GstSdp, GLib, GstVideo
from PyQt5 import QtCore

from gst_utils import _make, get_decoder_and_sink
from config import (
    STUN_SERVER,
    GST_VIDEO_CAPS,
    UI_OVERLAY_DELAY_MS,
    ICE_STATE_CHECK_DELAY_MS,
)


# ============================
# 통계 스레드 (백그라운드)
# ============================
class _StatsWorker(threading.Thread):
    """PeerReceiver 하나 당 1개 스레드.
    GLib/Gst 객체는 직접 다루지 않고 PeerReceiver가 기록해둔 값만 읽어서 MQTT 전송.
    """
    def __init__(self, owner, mqtt_manager, name: str, interval_sec: float = 1.0):
        super().__init__(daemon=True)
        self._owner = owner
        self._mqtt = mqtt_manager
        self._interval = max(0.2, float(interval_sec))
        self._stop = threading.Event()
        self._render_idx = 0
        self._sample_every = 100
        print(f"[STATS-WORKER][{name}] thread initialized (interval={self._interval}s)")

    def stop(self):
        self._stop.set()

    def run(self):
        print(f"[STATS-WORKER][{self._owner.sender_name}] thread started (background)")
        while not self._stop.is_set():
            t0 = time.time()
            try:
                snap = self._owner._snapshot_stats()
                if snap and snap.get("share_active") and self._mqtt:
                    self._mqtt.publish_stats(self._owner.sender_name, snap["stats"], interval=self._interval)
            except Exception as e:
                print(f"[STATS-WORKER][{self._owner.sender_name}] error:", e)

            elapsed = time.time() - t0
            sleep_for = self._interval - elapsed
            if sleep_for > 0:
                self._stop.wait(sleep_for)
        print(f"[STATS-WORKER][{self._owner.sender_name}] thread stopped")


class PeerReceiver:
    """WebRTC 피어 연결을 관리하는 수신기 클래스"""

    # ------------ 초기화 ------------
    def __init__(self, sio, sender_id, sender_name, ui_window,
                 on_ready=None, on_down=None, mqtt_manager=None,
                 on_first_frame_callback=None):

        self.sio = sio
        self.sender_id = sender_id
        self.sender_name = sender_name
        self.ui = ui_window
        self.mqtt_manager = mqtt_manager

        # 매니저가 전달해줄 송신 메타
        self.last_send_ts = None          # 마지막 전송 시각(ms)
        self._last_seq = -1               # 마지막 수신한 seq
        self._printed_seq = -1            # 이미 출력한 seq(중복 방지)
        self._sample_every = 100          # 100프레임마다 로그

        # 콜백
        self._on_ready = on_ready
        self._on_down = on_down

        # WebRTC/파이프라인 상태
        self._gst_playing = False
        self._negotiating = False
        self._pending_offer_sdp = None
        self._transceivers = []
        self._transceivers_added = False
        self._display_bin = None
        self._winid = None

        # 공유/활성 상태
        self.share_active = True

        # 통계 필드 (스레드 공유 → 락 보호)
        self._lock = threading.Lock()
        self._current_fps = 0.0
        self._drop_rate = 0.0
        self._avg_fps = 0.0
        self._bitrate_mbps = 0.0
        self._width = 0
        self._height = 0

        # 비트레이트 계산용
        self._byte_accum = 0
        self._last_ts = time.time()

        # GStreamer 파이프라인
        self._setup_pipeline()

        # 별도 통계 스레드 시작
        self._stats_worker = _StatsWorker(self, mqtt_manager, self.sender_name, interval_sec=1.0)
        self._stats_worker.start()

        self._recv_count = 0        # 누적 수신 프레임 수
        self._recv_log_interval = 1.0  # 로그 주기 (초)
        self._last_recv_log_time = time.time()

        self._on_first_frame_callback = on_first_frame_callback
        self._first_frame_received = False


    # ---- 매니저에서 frame-ts 전달 시 호출 ----
    def update_tx_meta(self, seq: int, ts_ms: float):
        """manager가 on('frame-ts')에서 호출.
        같은 sender의 마지막 seq/ts를 기록."""
        try:
            if seq is None or ts_ms is None:
                return
            self._last_seq = int(seq)
            self.last_send_ts = float(ts_ms)
        except Exception:
            pass

    # ---------------- 내부 도우미 ----------------
    def _snapshot_stats(self):
        """락으로 보호된 현재 통계 스냅샷 반환"""
        with self._lock:
            return {
                "share_active": bool(self.share_active),
                "stats": {
                    "name": self.sender_name,
                    "fps": float(self._current_fps),
                    "drop": float(self._drop_rate),
                    "avg_fps": float(self._avg_fps),
                    "mbps": float(self._bitrate_mbps),
                    "width": int(self._width or 0),
                    "height": int(self._height or 0),
                },
            }

    def _collect_stats(self):
        """기존 MQTT 루틴과 호환을 위해 남겨둠"""
        with self._lock:
            return {
                "name": self.sender_name,
                "fps": self._current_fps,
                "drop": self._drop_rate,
                "avg_fps": self._avg_fps,
                "mbps": self._bitrate_mbps,
                "width": self._width,
                "height": self._height,
            }

    # ---------------- UI 관련 ----------------
    def prepare_window_handle(self):
        try:
            w = self.ui.ensure_widget(self.sender_id, self.sender_name)
            w.setAttribute(QtCore.Qt.WA_NativeWindow, True)
            self._winid = int(w.winId())
            print(f"[UI][{self.sender_name}] winId=0x{self._winid:x}")
        except Exception as e:
            print(f"[UI][{self.sender_name}] winId 준비 실패:", e)
        return False

    def update_window_from_widget(self, w):
        try:
            if not w:
                return
            if not w.isVisible():
                w.show()
            self._winid = int(w.winId())
            print(f"[DEBUG] update_window_from_widget: {self.sender_id} winId=0x{self._winid:x}")
            self._force_overlay_handle()
        except Exception as e:
            print(f"[UI][{self.sender_name}] update_window_from_widget failed:", e)

    def _force_overlay_handle(self):
        try:
            if self._winid and self._display_bin:
                sink = self._display_bin.get_property("video-sink")
                if sink:
                    GstVideo.VideoOverlay.set_window_handle(sink, self._winid)
                    print(f"[UI][{self.sender_name}] overlay rebind (0x{self._winid:x})")
        except Exception as e:
            print(f"[UI][{self.sender_name}] overlay rebind failed:", e)

    def _on_sync_message(self, bus, msg):
        try:
            if GstVideo.is_video_overlay_prepare_window_handle_message(msg):
                if self._winid is not None:
                    GstVideo.VideoOverlay.set_window_handle(msg.src, self._winid)
                    print(f"[UI][{self.sender_name}] overlay handle set (0x{self._winid:x})")
                    return Gst.BusSyncReply.DROP
        except Exception as e:
            print(f"[BUS][{self.sender_name}] sync handler error:", e)
        return Gst.BusSyncReply.PASS

    # ---------------- 파이프라인 ----------------
    def _setup_pipeline(self):
        self.pipeline = Gst.Pipeline.new(f"webrtc-pipeline-{self.sender_id}")
        self.webrtc = _make("webrtcbin")
        if not self.webrtc:
            raise RuntimeError("webrtcbin 생성 실패")
        self.pipeline.add(self.webrtc)
        self.webrtc.set_property('stun-server', STUN_SERVER)

        # WebRTC 이벤트 연결
        self._connect_webrtc_signals()

        # 버스
        bus = self.pipeline.get_bus()
        bus.set_sync_handler(self._on_sync_message)
        bus.add_signal_watch()
        bus.connect("message::state-changed", self._on_state_changed)
        bus.connect("message::error", self._on_error)
        bus.connect("message::qos", self._on_qos)

    def _on_qos(self, bus, msg):
        try:
            live, running_time, stream_time, timestamp, duration = msg.parse_qos()
            # msg.parse_qos_values()가 있으면 processing/jitter/dropped 꺼냄(환경별 지원)
            # 값을 누적해 추가 로그로 출력
        except Exception:
            pass


    def start(self):
        ret = self.pipeline.set_state(Gst.State.PLAYING)
        print(f"[GST][{self.sender_name}] set_state ->", ret.value_nick)

    def stop(self):
        # 통계 스레드 정지
        if self._stats_worker:
            self._stats_worker.stop()
            self._stats_worker.join(timeout=1.0)
            self._stats_worker = None

        # 파이프라인 정지
        try:
            if self.pipeline:
                self.pipeline.set_state(Gst.State.NULL)
                self.pipeline = None
        except Exception:
            pass

    def pause(self, reason=""):
        self.share_active = False
        try:
            if self.pipeline:
                self.pipeline.set_state(Gst.State.PAUSED)
                print(f"[GST][{self.sender_name}] → PAUSED ({reason or 'share stopped'})")
        except Exception as e:
            print(f"[GST][{self.sender_name}] pause err:", e)

    def resume_pipeline(self):
        self.share_active = True
        try:
            if self.pipeline:
                self.pipeline.set_state(Gst.State.PLAYING)
                print(f"[GST][{self.sender_name}] → PLAYING (share started)")
                GLib.timeout_add(UI_OVERLAY_DELAY_MS, lambda: (self._force_overlay_handle() or False))
        except Exception as e:
            print(f"[GST][{self.sender_name}] resume err:", e)

    # ---------------- 버스 콜백 ----------------
    def _on_state_changed(self, bus, msg):
        if msg.src is self.pipeline:
            _, new, _ = msg.parse_state_changed()
            if new == Gst.State.PLAYING and not self._gst_playing:
                self._gst_playing = True
                print(f"[GST][{self.sender_name}] pipeline → PLAYING")
                self._ensure_transceivers()
                if not self._pending_offer_sdp:
                    GLib.idle_add(self._maybe_create_offer)

    def _on_error(self, bus, msg):
        err, dbg = msg.parse_error()
        print(f"[GST][{self.sender_name}][ERROR] {err.message} (debug: {dbg})")

    # ---------------- ICE/시그널링 ----------------
    def _connect_webrtc_signals(self):
        self.webrtc.connect('notify::ice-connection-state', self._on_ice_conn_change)
        self.webrtc.connect('on-ice-candidate', self.on_ice_candidate)
        self.webrtc.connect('pad-added', self.on_incoming_stream)
        self.webrtc.connect('on-negotiation-needed', self._on_negotiation_needed)

    def _on_ice_conn_change(self, obj, pspec):
        try:
            state = int(self.webrtc.get_property('ice-connection-state'))
        except Exception as e:
            print(f"[RTC][{self.sender_name}] ICE state read error:", e)
            return

        print(f"[RTC][{self.sender_name}] ICE state:", state)

        if state in (4, 5, 6):  # failed/disconnected/closed
            def _maybe_remove():
                try:
                    st2 = int(self.webrtc.get_property('ice-connection-state'))
                    if st2 in (4, 5, 6):
                        if self._on_down:
                            self._on_down(self.sender_id, reason=f"ice-{st2}")
                except Exception:
                    if self._on_down:
                        self._on_down(self.sender_id, reason="ice-unknown")
                return False
            GLib.timeout_add(ICE_STATE_CHECK_DELAY_MS, _maybe_remove)

    def _on_negotiation_needed(self, element, *args):
        if self._negotiating:
            return
        GLib.idle_add(self._maybe_create_offer)

    def _maybe_create_offer(self):
        if self._negotiating:
            return False
        self._negotiating = True
        def _do():
            p = Gst.Promise.new_with_change_func(self._on_offer_created, self.webrtc)
            self.webrtc.emit('create-offer', None, p)
            return False
        GLib.idle_add(_do)
        return False

    def _on_offer_created(self, promise, element):
        reply = promise.get_reply()
        if not reply:
            self._negotiating = False
            return
        offer = reply.get_value('offer')
        if not offer:
            self._negotiating = False
            return
        self._pending_offer_sdp = offer.sdp.as_text()
        p2 = Gst.Promise.new_with_change_func(self._on_local_desc_set, element)
        element.emit('set-local-description', offer, p2)

    def _on_local_desc_set(self, promise, element):
        print(f"[RTC][{self.sender_name}] Local description set (offer)")
        if self._gst_playing and self.sender_id:
            self._send_offer()
        self._negotiating = False

    def _send_offer(self):
        if not self._pending_offer_sdp:
            return
        self.sio.emit('signal', {
            'to': self.sender_id,
            'from': self.sio.sid,
            'type': 'offer',
            'payload': {'type': 'offer', 'sdp': self._pending_offer_sdp}
        })
        print(f"[SIO][{self.sender_name}] offer 전송 → {self.sender_id}")

    def apply_remote_answer(self, sdp_text: str):
        ok, sdpmsg = GstSdp.SDPMessage.new()
        if ok != GstSdp.SDPResult.OK:
            return False
        GstSdp.sdp_message_parse_buffer(sdp_text.encode('utf-8'), sdpmsg)
        answer = GstWebRTC.WebRTCSessionDescription.new(GstWebRTC.WebRTCSDPType.ANSWER, sdpmsg)
        self.webrtc.emit('set-remote-description', answer, None)
        print(f"[RTC][{self.sender_name}] Remote ANSWER 적용 완료")
        return False

    def on_ice_candidate(self, element, mlineindex, candidate):
        self.sio.emit('signal', {
            'to': self.sender_id,
            'from': self.sio.sid,
            'type': 'candidate',
            'payload': {
                'candidate': candidate,
                'sdpMid': f"video{mlineindex}",
                'sdpMLineIndex': int(mlineindex),
            }
        })

    # ---------------- 미디어 스트림 ----------------
    def on_incoming_stream(self, webrtc, pad):
        caps = pad.get_current_caps()
        if not caps:
            return
        caps_str = caps.to_string()
        if not caps_str.startswith("application/x-rtp"):
            return

        depay = _make("rtph264depay")
        parse = _make("h264parse")
        decoder, conv, _ = get_decoder_and_sink()

        # ── 표시 경로 요소
        tee = _make("tee")
        q_disp = _make("queue")
        identity_render = _make("identity")

        # 실제 화면 싱크 선택
        sink = None
        if sys.platform.startswith("linux"):
            sink = _make("nv3dsink") or _make("glimagesink")
        elif sys.platform == "win32":
            sink = _make("d3d11videosink")
        elif sys.platform == "darwin":
            sink = _make("glimagesink")
        if sink:
            sink.set_property("sync", True)   # 화면 동기화 켜서 체감 지연 반영
            sink.set_property("qos", True)

        # ── 통계 분기: fpsdisplaysink는 통계 전용
        q_stat = _make("queue")
        fpssink = _make("fpsdisplaysink")
        if fpssink:
            fpssink.set_property("signal-fps-measurements", True)
            fpssink.set_property("text-overlay", False)
            fpssink.set_property("sync", False)  # 통계 경로 비동기
            fpssink.connect("fps-measurements", self._on_fps_measurements)

        # 패킷 단위 비트레이트 측정(기존 유지)
        rtp_id = _make("identity")
        if rtp_id:
            rtp_id.set_property("signal-handoffs", True)
            rtp_id.connect("handoff", self._on_rtp_handoff)

        # 디코더 출력 기준 측정(비교용, 선택)
        frame_id = _make("identity")
        if frame_id:
            frame_id.set_property("signal-handoffs", True)
            frame_id.connect("handoff", self._on_frame_handoff)

        # 렌더 직전 측정 훅
        identity_render.set_property("signal-handoffs", True)
        identity_render.connect("handoff", self._on_render_handoff)

        # 필수 요소 확인(표시 경로 기준)
        if not all([depay, parse, decoder, conv, tee, q_disp, identity_render, sink]):
            print(f"[RTC][{self.sender_name}] 요소 부족으로 링크 실패")
            return

        # 파이프라인에 추가
        for e in (depay, rtp_id, parse, decoder, frame_id, conv, tee,
                q_disp, identity_render, sink,
                q_stat, fpssink):
            if e:
                self.pipeline.add(e)
                e.sync_state_with_parent()

        # 링크: RTP → depay → rtp_id → parse → decoder
        if pad.link(depay.get_static_pad("sink")) != Gst.PadLinkReturn.OK:
            print(f"[RTC][{self.sender_name}] pad link 실패"); return
        if not depay.link(rtp_id):  print("link depay→rtp_id 실패"); return
        if not rtp_id.link(parse):  print("link rtp_id→parse 실패"); return
        if not parse.link(decoder): print("link parse→decoder 실패"); return

        # decoder → (frame_id) → conv
        if frame_id:
            if not decoder.link(frame_id):   print("link decoder→frame_id 실패"); return
            if not frame_id.link(conv):      print("link frame_id→conv 실패"); return
        else:
            if not decoder.link(conv):       print("link decoder→conv 실패"); return

        # conv → tee
        if not conv.link(tee):               print("link conv→tee 실패"); return

        # tee 분기: request pad로 분기 생성
        # branch-1: 표시 경로 conv→tee→q_disp→identity_render→sink
        tee_src1 = tee.get_request_pad("src_%u")
        q_disp_sink = q_disp.get_static_pad("sink")
        if tee_src1 is None or q_disp_sink is None or tee_src1.link(q_disp_sink) != Gst.PadLinkReturn.OK:
            print("link tee(src1)→q_disp(sink) 실패"); return
        if not q_disp.link(identity_render): print("link q_disp→identity_render 실패"); return
        if not identity_render.link(sink):   print("link identity_render→sink 실패"); return

        # branch-2: 통계 경로 conv→tee→q_stat→fpssink
        if fpssink:
            tee_src2 = tee.get_request_pad("src_%u")
            q_stat_sink = q_stat.get_static_pad("sink")
            if tee_src2 is None or q_stat_sink is None or tee_src2.link(q_stat_sink) != Gst.PadLinkReturn.OK:
                print("link tee(src2)→q_stat(sink) 실패"); return
            if not q_stat.link(fpssink):     print("link q_stat→fpssink 실패"); return

        self._display_bin = sink
        print(f"[OK][{self.sender_name}] video linked (render tap before sink)")

    def _on_render_handoff(self, identity, buffer):
        # 송신 seq와 100프레임 간격에 맞춰 출력
        seq = getattr(self, "_last_seq", -1)
        if seq <= 0 or (seq % self._sample_every) != 0 or seq == getattr(self, "_printed_seq_render", -1):
            return

        send_ms = self.last_send_ts
        if send_ms is None:
            return
        recv_ms = time.time() * 1000.0   # 렌더 직전 시각
        lat = recv_ms - send_ms
        if lat < 0:
            return

        # print(f"[DELAY:render][{self.sender_name}] frame#{seq} latency={lat:.0f} ms")
        self._printed_seq_render = seq

    def _on_frame_handoff(self, identity, buffer):
        """프레임 단위 latency 측정 + sender/receiver 시간(ms) 함께 txt 저장"""
        try:
            now_ms = time.time() * 1000.0
            send_ms = self.last_send_ts
            if send_ms is None:
                return

            # ---------------- NEW: 첫 프레임 감지 및 콜백 호출 ----------------
            if not self._first_frame_received:
                self._first_frame_received = True
                if self._on_first_frame_callback:
                    # GLib.idle_add 없이 직접 호출 (on_frame_handoff는 GLib 스레드에서 실행됨)
                    # PeerReceiver.py에 GLib.idle_add가 없다면, GLib 루프가 돌고 있는 환경이므로 바로 호출해도 됩니다.
                    self._on_first_frame_callback(self.sender_id) 

            self._recv_count += 1

            latency = now_ms - send_ms
            if latency < 0:
                return

            now = time.time()
            if now - getattr(self, "_last_recv_log_time", 0) >= self._recv_log_interval:
                self._last_recv_log_time = now
                print(f"[RECV][{self.sender_name}] 총 수신 프레임 수 = {self._recv_count}")


            # -------------------------
            # timestamp string (사람이 보기 좋게)
            # -------------------------
            recv_dt = datetime.now(ZoneInfo("Asia/Seoul"))
            recv_str = recv_dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

            # -------------------------
            # 로그 파일 경로
            # -------------------------
            import os
            log_dir = os.path.join(os.path.expanduser("~"), "Documents")
            os.makedirs(log_dir, exist_ok=True)
            log_path = os.path.join(log_dir, "receiver_latency_log.txt")

            # -------------------------
            # 파일 기록
            # -------------------------
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(
                    f"[{self.sender_name}]|"
                    f"{send_ms:.3f}|"
                    f"{now_ms:.3f}| "
                    f"{latency:.1f}\n"
                )

            # 최신 latency 유지
            self._last_latency = latency

            # 콘솔 출력 (선택)
            # print(f"[LAT][{self.sender_name}] sender={send_ms:.3f} recv={now_ms:.3f} Δ={latency:.1f} ms")

        except Exception as e:
            print(f"[LAT][{self.sender_name}] handoff error:", e)

        if not self._first_frame_received:
            self._first_frame_received = True
            if self._on_first_frame_callback:
                # GLib.idle_add를 사용하여 메인 스레드에서 콜백이 실행되도록 안전하게 전달합니다.
                GLib.idle_add(self._on_first_frame_callback, self.sender_id)


    # ---------------- FPS/Bitrate 콜백 ----------------
    def _on_fps_measurements(self, element, fps, drop, avg):
        # 통계만 갱신
        with self._lock:
            self._current_fps = float(fps)
            self._drop_rate = float(drop)
            self._avg_fps = float(avg)
            try:
                # self._display_bin은 실제 sink (glimagesink/d3d11videosink 등)
                if self._display_bin:
                    pad = self._display_bin.get_static_pad("sink")
                    if pad:
                        caps = pad.get_current_caps()
                        if caps:
                            s = caps.get_structure(0)
                            self._width = int(s.get_value("width") or 0)
                            self._height = int(s.get_value("height") or 0)
            except Exception:
                pass
        # 렌더 지연 로그는 여기서 찍지 않음.
        # 실제 렌더 직전(identity_render handoff)에서 _on_render_handoff로만 출력.

    def _on_rtp_handoff(self, identity, buffer):
        size = buffer.get_size()
        now = time.time()
        self._byte_accum += size
        elapsed = now - self._last_ts
        if elapsed >= 1.0:
            with self._lock:
                self._bitrate_mbps = (self._byte_accum * 8) / (elapsed * 1_000_000)
            self._byte_accum = 0
            self._last_ts = now

    # ---------------- 수신 전용 트랜시버 ----------------
    def _add_recv(self, caps_str):
        t = self.webrtc.emit(
            'add-transceiver',
            GstWebRTC.WebRTCRTPTransceiverDirection.RECVONLY,
            Gst.Caps.from_string(caps_str)
        )
        self._transceivers.append(t)
        print(f'[RTC][{self.sender_name}] transceiver added:', bool(t))

    def _ensure_transceivers(self):
        if self._transceivers_added:
            return
        self._add_recv(GST_VIDEO_CAPS)
        self._transceivers_added = True
