import os, json
from flask import Flask, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", ping_timeout=5, ping_interval=2)

receiver = None
senders = {}  # sender_id -> {id, name}


# ---------- Helper ----------
def emit_sender_list():
    """현재 sender 목록을 receiver에게 전달"""
    if receiver:
        sender_arr = [{"id": s["id"], "name": s["name"]} for s in senders.values()]
        socketio.emit("sender-list", sender_arr, to=receiver)

def _sid_by_name(name: str):
    """name → sid 매핑"""
    return next((sid for sid, s in senders.items() if s.get("name") == name), None)


# ---------- Socket Events ----------
@socketio.on("share-request")
def handle_share_request(data):
    to = data.get("to")
    emit("share-request", {"from": request.sid}, to=to)


@socketio.on("share-started")
def handle_share_started(data):
    global receiver
    if not receiver:
        return
    sender_info = senders.get(request.sid, {})
    display_name = sender_info.get("name") or data.get("name") or f"Sender-{request.sid[:5]}"
    emit("sender-share-started", {"id": request.sid, "name": display_name}, to=receiver)
    emit_sender_list()


@socketio.on("sender-share-stopped")
def handle_sender_stopped():
    global receiver
    if receiver:
        emit("sender-share-stopped", {"id": request.sid}, to=receiver)


@socketio.on("del-room")
def handle_del_room(data):
    global receiver, senders
    if data.get("role") == "receiver":
        for sender_id in list(senders.keys()):
            emit("room-deleted", to=sender_id)
        receiver = None
        senders.clear()


@socketio.on("join-room")
def handle_join_room(data):
    """receiver 또는 sender가 방에 참가"""
    global receiver, senders
    role = data.get("role")
    name = data.get("name")

    if role == "receiver":
        receiver = request.sid
        emit_sender_list()
        return {"success": True}

    # sender
    if not receiver:
        return {"success": False, "message": "리시버가 없습니다."}

    if any(s["name"] == name for s in senders.values()):
        return {"success": False, "message": "이미 사용 중인 이름입니다."}

    assigned_name = name or f"Sender-{request.sid[:5]}"
    senders[request.sid] = {"id": request.sid, "name": assigned_name}

    emit_sender_list()
    emit("joined-room", {"name": assigned_name}, to=request.sid)
    emit("join-complete", {"name": assigned_name}, to=request.sid)

    return {"success": True, "name": assigned_name}


@socketio.on("signal")
def handle_signal(data):
    """WebRTC 시그널링"""
    global receiver, senders
    data = data or {}
    data["from"] = request.sid

    if request.sid in senders:  # sender
        if receiver:
            data["to"] = receiver
            emit("signal", data, to=receiver)
    elif request.sid == receiver:  # receiver
        target = data.get("to")
        if target and target in senders:
            emit("signal", data, to=target)

@socketio.on("frame-ts")
def on_frame_ts(data):
    sender_id = data.get("senderId")
    ts = data.get("ts_ms")
    seq = data.get("seq")
    if not receiver or ts is None or seq is None:
        return
    meta = senders.get(request.sid, {"id": request.sid, "name": None})
    socketio.emit(
        "frame-ts",
        {"from": meta["id"], "name": meta.get("name"), "ts_ms": float(ts), "seq": int(seq)},
        to=receiver,
    )


# ---------- Disconnect 처리 ----------
@socketio.on("disconnect")
def handle_disconnect():
    global receiver, senders
    print(f"[DISC] sid={request.sid} recv={bool(receiver)} in_senders={request.sid in senders}")

    if request.sid in senders:  # sender 끊김
        # 1) 목록에서 제거
        senders.pop(request.sid, None)

        # 2) 즉시 알림
        if receiver:
            socketio.emit("sender-disconnected", {"id": request.sid}, to=receiver)
            emit_sender_list()

    elif request.sid == receiver:  # receiver 끊김
        for sender_id in list(senders.keys()):
            socketio.emit("room-deleted", to=sender_id)
        receiver = None
        senders.clear()


# ---------- /api/left 처리 ----------
@app.post("/api/left")
def api_left():
    """브라우저 sendBeacon 등으로 퇴장 알림"""
    data = request.get_json(silent=True)
    if data is None:
        raw = (request.data or b"").decode("utf-8").strip()
        try:
            data = json.loads(raw) if raw.startswith("{") else {"name": raw}
        except json.JSONDecodeError:
            data = {"name": raw}

    sid = data.get("sid")
    name = data.get("name")
    if not sid and name:
        sid = _sid_by_name(name)

    if not sid:
        print(f"[API_LEFT] No sid resolved (name={name})")
        return ("", 204)

    if sid in senders:
        # 1) 제거 먼저
        senders.pop(sid, None)

        # 2) 즉시 알림
        if receiver:
            socketio.emit("sender-disconnected", {"id": sid}, to=receiver)
            emit_sender_list()

        # 3) MQTT 발행
        try:
            import paho.mqtt.publish as publish
            payload = json.dumps({"id": sid, "name": name or sid})
            publish.single("participant/left", payload, hostname="127.0.0.1", port=1883)
            publish.single("participant/update",
                           json.dumps([{"id": s["id"], "name": s["name"]} for s in senders.values()]),
                           hostname="127.0.0.1", port=1883)
            print(f"[MQTT] Published immediate leave: {payload}")
        except Exception as e:
            print("[MQTT] publish error in /api/left:", e)

    return ("", 204)


# ---------- CORS 처리 ----------
@app.after_request
def _cors(resp):
    if request.path.startswith("/api/"):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return resp

@app.route("/api/left", methods=["OPTIONS"])
def api_left_preflight():
    return ("", 204)


# ---------- Start Server ----------
if __name__ == "__main__":
    base_dir = os.path.dirname(__file__)
    sender_dir = os.path.join(base_dir, "../sender")

    cert_path = os.path.abspath(os.path.join(sender_dir, "cert.pem"))
    key_path = os.path.abspath(os.path.join(sender_dir, "key.pem"))

    socketio.run(
        app,
        host="0.0.0.0",
        port=3001,
        ssl_context=(cert_path, key_path)
    )
