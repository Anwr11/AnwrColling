# -*- coding: utf-8 -*-
import os, time, random
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit, join_room, leave_room

NUMBER_PREFIX = os.getenv("NUMBER_PREFIX", "33")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
app.config["ENV"] = "production"
app.config["DEBUG"] = False

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading", logger=False, engineio_logger=False)

USERS = {}
SIDS = {}
CONNS = {}

def make_number():
    rest = "".join(random.choice("0123456789") for _ in range(7))
    return f"{NUMBER_PREFIX}{rest}"

def conv_room(a, b):
    a, b = str(a), str(b)
    low, high = (a, b) if a <= b else (b, a)
    return f"conv:{low}-{high}"

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/alloc")
def alloc():
    num = make_number()
    return jsonify({"number": num})

@app.get("/healthz")
def healthz():
    return jsonify({"ok": True, "ts": time.time()})

@socketio.on("connect")
def on_connect():
    emit("server_info", {"msg": "connected", "sid": request.sid})

@socketio.on("register")
def on_register(data):
    num = str(data.get("number", ""))
    if not num:
        emit("error", {"message": "number required"}); return
    USERS[num] = request.sid
    SIDS[request.sid] = num
    join_room(f"user:{num}")
    emit("registered", {"number": num})

@socketio.on("start_chat")
def on_start_chat(data):
    me = SIDS.get(request.sid)
    peer = str(data.get("peer", ""))
    if not me or not peer:
        emit("error", {"message": "peer required"}); return
    room = conv_room(me, peer)
    join_room(room)
    CONNS.setdefault(room, set()).update([me, peer])
    emit("chat_ready", {"room": room, "with": peer})
    emit("system", {"room": room, "text": f"بدأت محادثة بين {me} و {peer}."}, room=room)

@socketio.on("leave_chat")
def on_leave_chat(data):
    me = SIDS.get(request.sid)
    peer = str(data.get("peer",""))
    if not me or not peer: return
    room = conv_room(me, peer)
    leave_room(room)
    emit("system", {"room": room, "text": f"{me} غادر المحادثة."}, room=room)

@socketio.on("typing")
def on_typing(data):
    me = SIDS.get(request.sid); peer = str(data.get("peer","")); flag = bool(data.get("flag", False))
    if not me or not peer: return
    room = conv_room(me, peer)
    emit("typing", {"from": me, "flag": flag}, room=room, include_self=False)

@socketio.on("message")
def on_message(data):
    me = SIDS.get(request.sid); peer = str(data.get("peer","")); text = str(data.get("text","")).strip()
    if not me or not peer or not text: return
    room = conv_room(me, peer)
    payload = {"from": me, "text": text, "ts": time.time()}
    emit("message", payload, room=room)

@socketio.on("webrtc-offer")
def on_offer(data):
    me = SIDS.get(request.sid); peer = str(data.get("peer",""))
    sdp = data.get("sdp")
    if not me or not peer or not sdp: return
    room = conv_room(me, peer)
    emit("webrtc-offer", {"from": me, "sdp": sdp}, room=room, include_self=False)

@socketio.on("webrtc-answer")
def on_answer(data):
    me = SIDS.get(request.sid); peer = str(data.get("peer",""))
    sdp = data.get("sdp")
    if not me or not peer or not sdp: return
    room = conv_room(me, peer)
    emit("webrtc-answer", {"from": me, "sdp": sdp}, room=room, include_self=False)

@socketio.on("webrtc-ice")
def on_ice(data):
    me = SIDS.get(request.sid); peer = str(data.get("peer",""))
    cand = data.get("candidate")
    if not me or not peer or not cand: return
    room = conv_room(me, peer)
    emit("webrtc-ice", {"from": me, "candidate": cand}, room=room, include_self=False)

@socketio.on("webrtc-reject")
def on_reject(data):
    me = SIDS.get(request.sid); peer = str(data.get("peer",""))
    if not me or not peer: return
    room = conv_room(me, peer)
    emit("webrtc-reject", {"from": me}, room=room, include_self=False)

@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    num = SIDS.pop(sid, None)
    if num:
        USERS.pop(num, None)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 5000)))
