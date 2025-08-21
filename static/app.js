
(() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // Elements
  const chatList = $("#chatList");
  const messagesEl = $("#messages");
  const peerTitle = $("#peerTitle");
  const peerSub = $("#peerSub");
  const msgBox = $("#msgBox");
  const sendBtn = $("#sendBtn");
  const startChatBtn = $("#startChatBtn");
  const peerInput = $("#peerInput");
  const meNumberEl = $("#meNumber");
  const copyMyNumber = $("#copyMyNumber");
  const toast = $("#toast");
  const callBtn = $("#callBtn");
  const endCallBtn = $("#endCallBtn");
  const muteBtn = $("#muteBtn");

  // Modal
  const incomingModal = $("#incomingModal");
  const incomingFrom = $("#incomingFrom");
  const acceptCall = $("#acceptCall");
  const declineCall = $("#declineCall");

  // State
  const state = {
    me: null,
    peer: null,
    dnd: false,
    chats: new Map(), // peer -> {unread, online}
    pc: null,
    localStream: null,
    muted: false
  };

  // Utils
  const saveLocal = () => {
    localStorage.setItem("colling:me", state.me || "");
    localStorage.setItem("colling:chats", JSON.stringify([...state.chats.keys()]));
  };
  const loadLocal = () => {
    state.me = localStorage.getItem("colling:me") || null;
    const arr = JSON.parse(localStorage.getItem("colling:chats") || "[]");
    arr.forEach(p => state.chats.set(p, {unread:0, online:false}));
  };
  const beep = (f=880, t=0.08) => {
    try {
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type="triangle"; o.frequency.value=f;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t);
      o.start(); o.stop(ctx.currentTime + t);
    } catch {}
  };
  const showToast = (txt) => {
    toast.textContent = txt;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1600);
  };

  // Render chat list
  const renderChatList = () => {
    chatList.innerHTML = "";
    for (const [p, meta] of state.chats.entries()) {
      const li = document.createElement("li");
      li.className = "chat-item" + (state.peer===p ? " active": "");
      const dot = document.createElement("span");
      dot.className = "status-dot " + (meta.online ? "status-online": "");
      const label = document.createElement("span");
      label.textContent = p + (meta.unread ? ` (${meta.unread})` : "");
      li.appendChild(dot); li.appendChild(label);
      li.onclick = () => switchPeer(p);
      chatList.appendChild(li);
    }
  };

  const switchPeer = (p) => {
    if (!p) return;
    state.peer = p;
    peerTitle.textContent = p;
    peerSub.textContent = "متصل بالمحادثة";
    if (state.chats.has(p)) { state.chats.get(p).unread = 0; }
    renderChatList();
    messagesEl.querySelectorAll(`[data-peer="${p}"]`).forEach(el => el.classList.remove("unread"));
    socket.emit("start_chat", { peer: p });
  };

  // Socket.IO
  const socket = io({ transports: ["websocket"], autoConnect: false });

  socket.on("connect", () => {
    socket.emit("register", { number: state.me });
  });

  socket.on("registered", ({ number }) => {
    showToast("تم تسجيل الرقم: " + number);
  });

  socket.on("presence", ({ number, status }) => {
    if (state.chats.has(number)) {
      state.chats.get(number).online = (status==="online");
      renderChatList();
    }
  });

  socket.on("system", (data) => {
    const div = document.createElement("div");
    div.className = "bubble system";
    div.textContent = data.text || "";
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  socket.on("typing", ({ from, flag }) => {
    if (from === state.peer) {
      peerSub.textContent = flag ? "يكتب الآن…" : "متصل بالمحادثة";
    }
  });

  socket.on("message", (payload) => {
    const fromPeer = (payload.from === state.me) ? state.peer : payload.from;
    if (!state.chats.has(fromPeer)) {
      state.chats.set(fromPeer, { unread:0, online:false });
      renderChatList(); saveLocal();
    }
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (payload.from === state.me ? "me" : "");
    bubble.dataset.peer = fromPeer;
    bubble.innerHTML = `<div>${payload.text}</div><div class="meta">${new Date(payload.ts*1000).toLocaleTimeString()}</div>`;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (payload.from !== state.me && fromPeer !== state.peer) {
      // Unread increase
      state.chats.get(fromPeer).unread += 1; renderChatList();
      if (!state.dnd) beep(780, .12);
    }
  });

  // ---- WebRTC Signaling ----
  let makingOffer = false;

  const createPC = () => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302"}] });
    pc.onicecandidate = e => {
      if (e.candidate && state.peer) socket.emit("webrtc-ice", { peer: state.peer, candidate: e.candidate });
    };
    pc.ontrack = e => {
      const [stream] = e.streams;
      attachRemote(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        endCall();
      }
    };
    return pc;
  };

  const ensureLocalStream = async () => {
    if (state.localStream) return state.localStream;
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    state.localStream = s;
    return s;
  };

  const startCall = async () => {
    if (!state.peer) { showToast("اختر محادثة أولاً"); return; }
    await ensureLocalStream();
    state.pc = createPC();
    state.localStream.getTracks().forEach(t => state.pc.addTrack(t, state.localStream));
    makingOffer = true;
    await state.pc.setLocalDescription(await state.pc.createOffer());
    socket.emit("webrtc-offer", { peer: state.peer, sdp: state.pc.localDescription });
    makingOffer = false;
    showToast("جاري الاتصال...");
  };

  const acceptIncoming = async (from, sdp) => {
    await ensureLocalStream();
    state.peer = from;
    renderChatList();
    state.pc = createPC();
    state.localStream.getTracks().forEach(t => state.pc.addTrack(t, state.localStream));
    await state.pc.setRemoteDescription(sdp);
    await state.pc.setLocalDescription(await state.pc.createAnswer());
    socket.emit("webrtc-answer", { peer: from, sdp: state.pc.localDescription });
    hideIncoming();
    showToast("تم قبول المكالمة");
  };

  const endCall = () => {
    if (state.pc) { try { state.pc.close(); } catch{} state.pc = null; }
    detachRemote();
    showToast("تم إنهاء المكالمة");
  };

  const attachRemote = (stream) => {
    let el = document.getElementById("remoteAudio");
    if (!el) {
      el = document.createElement("audio");
      el.id = "remoteAudio";
      el.autoplay = true;
      document.body.appendChild(el);
    }
    el.srcObject = stream;
  };
  const detachRemote = () => {
    const el = document.getElementById("remoteAudio");
    if (el) { el.srcObject = null; el.remove(); }
  };

  socket.on("webrtc-offer", async ({ from, sdp }) => {
    if (state.dnd) return; // ignore in DND
    // prompt
    incomingFrom.textContent = `من: ${from}`;
    incomingModal.classList.remove("hidden");
    acceptCall.onclick = () => acceptIncoming(from, sdp);
    declineCall.onclick = () => {
      incomingModal.classList.add("hidden");
      socket.emit("message", { peer: from, text: "المكالمة مرفوضة الآن" });
    };
  });

  socket.on("webrtc-answer", async ({ from, sdp }) => {
    if (!state.pc) return;
    await state.pc.setRemoteDescription(sdp);
    showToast("تم الاتصال ✔");
  });

  socket.on("webrtc-ice", async ({ from, candidate }) => {
    if (!state.pc) return;
    try { await state.pc.addIceCandidate(candidate); } catch (err) { console.warn(err); }
  });

  const hideIncoming = () => incomingModal.classList.add("hidden");

  // ---- UI actions ----
  sendBtn.onclick = () => {
    const text = msgBox.value.trim();
    if (!text || !state.peer) return;
    socket.emit("message", { peer: state.peer, text });
    msgBox.value = "";
  };

  msgBox.oninput = () => {
    if (state.peer) socket.emit("typing", { peer: state.peer, flag: true });
    clearTimeout(msgBox._t);
    msgBox._t = setTimeout(() => {
      if (state.peer) socket.emit("typing", { peer: state.peer, flag: false });
    }, 800);
  };

  startChatBtn.onclick = () => {
    const p = (peerInput.value || "").trim();
    if (!p) return;
    if (!state.chats.has(p)) state.chats.set(p, { unread:0, online:false });
    saveLocal(); renderChatList();
    switchPeer(p);
    peerInput.value = "";
  };

  copyMyNumber.onclick = async () => {
    try { await navigator.clipboard.writeText(state.me); showToast("تم النسخ"); } catch { showToast("لم يتم النسخ"); }
  };

  $("#toggleTheme").onclick = () => document.body.classList.toggle("light");
  $("#dndBtn").onclick = (e) => { state.dnd = !state.dnd; e.target.classList.toggle("primary", state.dnd); showToast(state.dnd?"تم تفعيل عدم الإزعاج":"تم إيقاف عدم الإزعاج"); };

  callBtn.onclick = startCall;
  endCallBtn.onclick = endCall;
  muteBtn.onclick = () => {
    if (!state.localStream) return;
    state.muted = !state.muted;
    state.localStream.getAudioTracks().forEach(t => t.enabled = !state.muted);
    showToast(state.muted? "تم الكتم": "تم إلغاء الكتم");
  };

  // ---- Bootstrap ----
  loadLocal();
  (async () => {
    if (!state.me) {
      const res = await fetch("/alloc");
      const j = await res.json();
      state.me = j.number;
      saveLocal();
    }
    meNumberEl.textContent = state.me;
    socket.connect();
  })();
})();

// --- Mobile sidebar toggle & overlay ---
(() => {
  const sidebar = document.getElementById("sidebar");
  const menuBtn = document.getElementById("menuBtn");
  const overlay = document.getElementById("overlay");
  if (menuBtn && sidebar && overlay) {
    const toggle = () => {
      sidebar.classList.toggle("open");
      overlay.classList.toggle("show");
    };
    menuBtn.addEventListener("click", toggle);
    overlay.addEventListener("click", toggle);
  }
})();
