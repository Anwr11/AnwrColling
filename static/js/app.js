(() => {
  const $ = s => document.querySelector(s);
  const messagesEl = $("#messages");
  const chatList   = $("#chatList");
  const peerTitle  = $("#peerTitle");
  const peerSub    = $("#peerSub");
  const msgBox     = $("#msgBox");
  const sendBtn    = $("#sendBtn");
  const startChatBtn = $("#startChatBtn");
  const peerInput  = $("#peerInput");
  const meNumberEl = $("#meNumber");
  const copyMyNumber = $("#copyMyNumber");
  const callBtn    = $("#callBtn");
  const endCallBtn = $("#endCallBtn");
  const muteBtn    = $("#muteBtn");
  const menuBtn    = $("#menuBtn");
  const sidebar    = $("#sidebar");
  const overlay    = $("#overlay");
  const fab        = $("#fab");
  const exitChatBtn= $("#exitChat");
  const toast      = $("#toast");

  const localAudioEl  = $("#localAudio");
  const remoteAudioEl = $("#remoteAudio");

  // ===== Unlock للصوت (Android 14) =====
  let __audioUnlocked = false;
  function unlockAudioOnce() {
    if (__audioUnlocked) return;
    try {
      const a = document.createElement('audio');
      a.muted = true;
      a.playsInline = true;
      a.play?.().catch(()=>{});
    } catch(_) {}
    __audioUnlocked = true;
  }
  document.addEventListener('click', unlockAudioOnce, { once: true });

  // ===== Toast =====
  window.showToast = function(message, opts){
    opts = opts||{};
    toast.textContent = message;
    toast.className = "toast" + (opts.center ? " center show" : " show");
    const dur = Math.max(900, opts.duration || 1500);
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> toast.className="toast", dur);
  };

  // ===== Scroll =====
  let stickBottom = true;
  const nearBottom = () =>
    (messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 8);
  const scrollToBottom = (force = false) => {
    if (force || stickBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
  };
  messagesEl.addEventListener("scroll", () => { stickBottom = nearBottom(); });

  // ===== State =====
  const state = {
    me:null, peer:null, dnd:false,
    chats:new Map(),
    pc:null,
    localStream:null,
    muted:false,
    iAmCaller:false
  };

  const saveLocal = () => {
    localStorage.setItem("colling:me", state.me||"");
    localStorage.setItem("colling:chats", JSON.stringify([...state.chats.keys()]));
  };
  const loadLocal = () => {
    state.me = localStorage.getItem("colling:me")||null;
    try { JSON.parse(localStorage.getItem("colling:chats")||"[]")
      .forEach(p=>state.chats.set(p,{unread:0,online:false})); } catch {}
  };

  // ===== قائمة المحادثات =====
  const renderChatList = () => {
    chatList.innerHTML = "";
    for (const [p, meta] of state.chats.entries()) {
      const li = document.createElement("li");
      li.className = "chat-item" + (state.peer === p ? " active" : "");
      li.innerHTML =
        `<span class="status-dot ${meta.online ? "status-online" : ""}"></span>` +
        `<span>${p}${meta.unread ? ` (${meta.unread})` : ""}</span>`;
      li.onclick = () => switchPeer(p);
      chatList.appendChild(li);
    }
    const exitItem = document.createElement("li");
    exitItem.className = "chat-item exit" + (!state.peer ? " disabled" : "");
    exitItem.innerHTML =
      `<span class="exit-ico">🚪</span>` +
      `<span>${state.peer ? "الخروج من المحادثة الحالية" : "لا توجد محادثة للخروج"}</span>`;
    exitItem.onclick = () => {
      if (!state.peer) return;
      try { socket.emit("leave_chat", { peer: state.peer }); } catch {}
      state.peer = null;
      exitToList();
    };
    chatList.appendChild(exitItem);
  };

  const clearMessagesUI = () => {
    messagesEl.innerHTML = "";
    const sys = document.createElement("div");
    sys.className = "bubble system";
    sys.textContent = "لا توجد محادثة — اختر محادثة من القائمة";
    messagesEl.appendChild(sys);
    peerTitle.textContent = "لا توجد محادثة";
    peerSub.textContent = "اختر محادثة من القائمة";
    scrollToBottom(true);
  };

  const switchPeer = (p) => {
    if (!p) return;
    state.peer = p;
    peerTitle.textContent = p;
    peerSub.textContent = "متصل بالمحادثة";
    if (state.chats.has(p)) state.chats.get(p).unread = 0;
    renderChatList();
    socket.emit("start_chat", { peer: p });
    sidebar.classList.remove("open"); overlay.classList.remove("show");
    stickBottom = true; scrollToBottom(true);
  };

  // ===== Socket.IO =====
  const socket = io({ transports:["websocket"], autoConnect:false, upgrade:false, reconnection:true });
  socket.on("connect", () => socket.emit("register", { number: state.me }));
  socket.on("registered", ({ number }) => showToast("تم تسجيل الرقم: " + number));
  socket.on("presence", ({ number, status }) => {
    if(state.chats.has(number)){
      state.chats.get(number).online = (status==="online");
      renderChatList();
    }
  });
  socket.on("system", d => {
    const div=document.createElement("div");
    div.className="bubble system";
    div.textContent=d.text||"";
    messagesEl.appendChild(div);
    scrollToBottom();
  });
  socket.on("typing", ({ from, flag }) => {
    if(from===state.peer){
      peerSub.textContent = flag? "يكتب الآن…" : "متصل بالمحادثة";
    }
  });
  socket.on("message", (p) => {
    const fromPeer = (p.from===state.me)? state.peer : p.from;
    if(!state.chats.has(fromPeer)){
      state.chats.set(fromPeer,{unread:0,online:false});
      renderChatList();
      saveLocal();
    }
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (p.from===state.me?"me":"");
    bubble.innerHTML = `<div>${p.text}</div><div class="meta">${new Date(p.ts*1000).toLocaleTimeString()}</div>`;
    messagesEl.appendChild(bubble);
    scrollToBottom();
    if(p.from!==state.me && fromPeer!==state.peer){
      state.chats.get(fromPeer).unread++;
      renderChatList();
    }
  });

  // ===== WebRTC =====
  const createPC = () => {
    const pc = new RTCPeerConnection({
      iceServers:[
        {urls:"stun:stun.l.google.com:19302"},
        {urls:"stun:stun1.l.google.com:19302"}
      ]
    });
    // لا نضيف Transceiver يدويًا — نخلي addTrack يتولّى
    pc.onicecandidate = e => {
      if(e.candidate && state.peer) socket.emit("webrtc-ice", { peer: state.peer, candidate: e.candidate });
    };
    pc.ontrack = e => attachRemote(e.streams[0]);
    pc.onconnectionstatechange = () => {
      if(["disconnected","failed","closed"].includes(pc.connectionState)) endCall();
    };
    return pc;
  };

  async function getMicSimple() {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      },
      video: false
    });
    const t = s.getAudioTracks()[0];
    if (!t) throw new Error("لا يوجد مسار صوت");
    t.enabled = true;
    return s;
  }

  const ensureLocal = async () => {
    if (state.localStream) return state.localStream;
    const s = await getMicSimple();
    state.localStream = s;
    if (localAudioEl) {
      localAudioEl.srcObject = s;
      localAudioEl.muted = true;
      localAudioEl.play?.().catch(()=>{});
    }
    return s;
  };

  async function tuneSenderBitrate(pc){
    try {
      const snd = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (snd && snd.getParameters) {
        const p = snd.getParameters();
        p.encodings = [{ maxBitrate: 24000 }];
        await snd.setParameters(p);
      }
    } catch(_) {}
  }

  // ===== المتصل (Caller) =====
  const startCall = async () => {
    if(!state.peer) return showToast("اختر محادثة أولاً",{center:true});
    unlockAudioOnce();
    state.iAmCaller = true;

    // 1) افتح المايك مرة واحدة
    await ensureLocal();

    // 2) أنشئ اتصال جديد
    if (state.pc) { try { state.pc.close(); } catch{} }
    state.pc = createPC();

    // 3) أضف التراك الصوتي الحالي
    state.localStream.getAudioTracks().forEach(t => state.pc.addTrack(t, state.localStream));

    // 4) اضبط معدل البت للصوت
    await tuneSenderBitrate(state.pc);

    // 5) أنشئ Offer (صوت فقط)
    const offer = await state.pc.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:false });
    await state.pc.setLocalDescription(offer);

    // 6) أرسل الـSDP بعد تأخير بسيط
    setTimeout(() => {
      socket.emit("webrtc-offer", { peer: state.peer, sdp: state.pc.localDescription });
    }, 200);

    showToast("جاري الاتصال...", {center:true,duration:1200});
  };

  // ===== المجيب (Callee) =====
  const acceptIncoming = async (from, sdp) => {
    unlockAudioOnce();
    state.iAmCaller = false;
    state.peer = from; renderChatList();
    state.pc = createPC();

    try {
      await state.pc.setRemoteDescription(sdp);
      await ensureLocal();
      state.localStream.getAudioTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
    } catch(e) {
      await ensureLocal();
      state.localStream.getAudioTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
      await state.pc.setRemoteDescription(sdp);
    }

    await tuneSenderBitrate(state.pc);

    const answer = await state.pc.createAnswer({ offerToReceiveAudio:true, offerToReceiveVideo:false });
    await state.pc.setLocalDescription(answer);

    setTimeout(() => {
      socket.emit("webrtc-answer", { peer: from, sdp: state.pc.localDescription });
    }, 200);

    hideIncoming();
    remoteAudioEl?.play?.().catch(()=>{});
    showToast("تم الاتصال ✔",{center:true,duration:1200});
  };

  const endCall = () => {
    state.iAmCaller = false;
    if (state.pc) { try{state.pc.close();}catch{} state.pc = null; }
    if (state.localStream) {
      try { state.localStream.getTracks().forEach(t => t.stop()); } catch {}
      state.localStream = null;
    }
    detachRemote();
    showToast("تم إنهاء المكالمة",{center:true,duration:1200});
  };

  const attachRemote = (stream)=>{
    if (remoteAudioEl) {
      remoteAudioEl.srcObject = stream;
      remoteAudioEl.playsInline = true;
      try { remoteAudioEl.muted = false; } catch(_) {}
      try { remoteAudioEl.volume = 1.0; } catch(_) {}
      remoteAudioEl.play?.().catch(()=>{});
    }
  };

  const detachRemote = ()=>{
    if(remoteAudioEl){ remoteAudioEl.srcObject=null; }
  };

  // ===== إشارات WebRTC =====
  socket.on("webrtc-offer", ({ from, sdp }) => {
    incomingFrom.textContent=`من: ${from}`;
    incomingModal.classList.add("show");
    acceptCall.onclick=()=>acceptIncoming(from,sdp);
    declineCall.onclick=()=>{
      incomingModal.classList.remove("show");
      socket.emit("message",{ peer:from, text:"المكالمة مرفوضة الآن" });
      showToast("تم رفض المكالمة",{center:true});
    };
  });

  socket.on("webrtc-answer", async ({ from, sdp }) => {
    if(!state.pc) return;
    await state.pc.setRemoteDescription(sdp);

    // 🔧 مهم جدًا: ثبّت تراك المايك بعد اكتمال التفاوض (يحل كتم المتصل)
    try {
      const snd = state.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
      const tr = state.localStream?.getAudioTracks?.()[0];
      if (snd && tr) await snd.replaceTrack(tr);
    } catch(e){}

    remoteAudioEl?.play?.().catch(()=>{});
    showToast("تم الاتصال ✔",{center:true});
  });

  socket.on("webrtc-ice", async ({ from, candidate }) => {
    if(!state.pc) return;
    try{ await state.pc.addIceCandidate(candidate);}catch(e){}
  });

  // ===== actions =====
  const exitToList = () => {
    clearMessagesUI();
    sidebar.classList.add("open");
    overlay.classList.add("show");
    showToast("تم الخروج من المحادثة",{center:true});
    renderChatList();
  };

  sendBtn.onclick = () => {
    const text = msgBox.value.trim();
    if(!text||!state.peer) return;
    socket.emit("message",{ peer:state.peer, text });
    msgBox.value="";
    scrollToBottom(true);
  };

  msgBox.oninput = () => {
    if(state.peer) socket.emit("typing",{ peer:state.peer, flag:true });
    clearTimeout(msgBox._t);
    msgBox._t=setTimeout(()=>{
      if(state.peer) socket.emit("typing",{ peer:state.peer, flag:false });
    },600);
  };

  $("#dndBtn").onclick = (e)=>{
    state.dnd=!state.dnd;
    e.target.classList.toggle("primary",state.dnd);
    showToast(state.dnd?"تم تفعيل عدم الإزعاج":"تم إيقاف عدم الإزعاج");
  };

  $("#toggleTheme").onclick = ()=> document.body.classList.toggle("light");

  copyMyNumber.onclick = async ()=>{
    try{ await navigator.clipboard.writeText(state.me); showToast("تم النسخ"); }
    catch{ showToast("لم يتم النسخ"); }
  };

  startChatBtn.onclick = ()=>{
    const p=(peerInput.value||"").trim();
    if(!p) return;
    if(!state.chats.has(p)) state.chats.set(p,{unread:0,online:false});
    saveLocal(); renderChatList(); switchPeer(p); peerInput.value="";
  };

  muteBtn.onclick = ()=>{
    if(!state.localStream) return;
    state.muted=!state.muted;
    state.localStream.getAudioTracks().forEach(t=>t.enabled=!state.muted);
    showToast(state.muted?"تم الكتم":"تم إلغاء الكتم");
  };

  callBtn.onclick   = startCall;
  endCallBtn.onclick= endCall;

  exitChatBtn && (exitChatBtn.onclick = () => {
    if (state.peer) { try { socket.emit("leave_chat", { peer: state.peer }); } catch {} }
    state.peer = null;
    exitToList();
  });

  // ===== Drawer =====
  const toggleDrawer = ()=>{
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  };
  menuBtn.onclick = toggleDrawer;
  overlay.onclick  = toggleDrawer;
  if (fab) fab.onclick = toggleDrawer;

  // ===== Boot =====
  (async ()=>{
    loadLocal();
    if(!state.me){
      const r=await fetch("/alloc");
      const j=await r.json();
      state.me=j.number; saveLocal();
    }
    meNumberEl.textContent = state.me;
    renderChatList();
    clearMessagesUI();
    socket.connect();
    setInterval(()=>{ fetch('/healthz').catch(()=>{}); }, 240000);
  })();

  // incoming modal refs
  const incomingModal = $("#incomingModal");
  const incomingFrom  = $("#incomingFrom");
  const acceptCall    = $("#acceptCall");
  const declineCall   = $("#declineCall");
  function hideIncoming(){ incomingModal.classList.remove("show"); }
})();
