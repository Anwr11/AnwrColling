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

  // عناصر صوت (موجودة في HTML)
  const localAudioEl  = $("#localAudio");
  const remoteAudioEl = $("#remoteAudio");

  // ======== Unlock للصوت (ضروري لأندرويد 14) ========
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

  // ======== Toast helper ========
  window.showToast = function(message, opts){
    opts = opts||{};
    toast.textContent = message;
    toast.className = "toast" + (opts.center ? " center show" : " show");
    const dur = Math.max(900, opts.duration || 1500);
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> toast.className="toast", dur);
  };

  // ======== Scroll helpers ========
  let stickBottom = true;
  const nearBottom = () =>
    (messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 8);

  const scrollToBottom = (force = false) => {
    if (force || stickBottom) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  };
  messagesEl.addEventListener("scroll", () => { stickBottom = nearBottom(); });

  // ======== State ========
  const state = {
    me:null, peer:null, dnd:false,
    chats:new Map(),
    pc:null,
    localStream:null,
    muted:false
  };

  const saveLocal = () => {
    localStorage.setItem("colling:me", state.me||"");
    localStorage.setItem("colling:chats", JSON.stringify([...state.chats.keys()]));
  };
  const loadLocal = () => {
    state.me = localStorage.getItem("colling:me")||null;
    try {
      JSON.parse(localStorage.getItem("colling:chats")||"[]")
        .forEach(p=>state.chats.set(p,{unread:0,online:false}));
    } catch {}
  };

  // ======== قائمة المحادثات + خروج ========
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

  // ======== socket.io (WebSocket فقط لأداء أفضل) ========
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

  // ======== WebRTC (صوت فقط) ========
  // ضبط STUN + ترانسيڤر للصوت لإجبار وجود m=audio
  const createPC = () => {
    const pc = new RTCPeerConnection({
      iceServers:[
        {urls:"stun:stun.l.google.com:19302"},
        {urls:"stun:stun1.l.google.com:19302"}
      ]
    });
    try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch(_) {}

    pc.onicecandidate = e => {
      if(e.candidate && state.peer) socket.emit("webrtc-ice", { peer: state.peer, candidate: e.candidate });
    };
    pc.ontrack = e => attachRemote(e.streams[0]);
    pc.onconnectionstatechange = () => {
      if(["disconnected","failed","closed"].includes(pc.connectionState)) endCall();
    };
    pc.oniceconnectionstatechange = () => {
      // console.log('ICE:', pc.iceConnectionState);
    };
    return pc;
  };

  // إعدادات مايك مناسبة + إعادة محاولة (Android 14)
  const MIC_CONSTRAINTS = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1
    },
    video: false
  };

  async function getMicStreamWithRetry() {
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    } catch (e) {
      console.warn("Retrying mic request (profile fallback)...", e);
      s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    // فحص حالة التراك
    try {
      const tracks = s.getAudioTracks();
      if (tracks.length === 0) throw new Error("No audio track");
      const t = tracks[0];
      if (t && t.enabled === false) t.enabled = true;
      console.log("Mic track state:", t.readyState, "enabled:", t.enabled);
    } catch (e) {
      console.warn("Audio track check:", e);
    }
    return s;
  }

  const ensureLocal = async () => {
    if(state.localStream) return state.localStream;
    // ⚠️ يُستخدم غالبًا عند الطرف المُجيب
    const s = await getMicStreamWithRetry();
    state.localStream = s;

    if (localAudioEl) {
      localAudioEl.srcObject = s;
      localAudioEl.muted = true;
      localAudioEl.play?.().catch(()=>{});
    }

    return s;
  };

  // ضبط bitrate للصوت (≈24kbps) لتحسين الثبات
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

  // ======== (جديد) أدوات حل مشكلة تعطل مايك المتصل ========

  // أوقف أي ستريم قديم بأمان
  function stopStream(s) {
    if (!s) return;
    try { s.getTracks().forEach(t => t.stop()); } catch {}
  }

  // بروفايلات مايك متعددة (تفيد أجهزة عنيدة في Android 14)
  const MIC_PROFILES = [
    { audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 }, video:false },
    { audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:1 }, video:false },
    { audio: true, video:false }
  ];

  // افتح مايك جديد من الصفر مع ربط أحداث التعطّل
  async function openMicFresh() {
    // أقفل أي ستريم سابق
    stopStream(state.localStream);
    state.localStream = null;

    let lastErr;
    for (const prof of MIC_PROFILES) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(prof);
        const track = s.getAudioTracks()[0];
        if (!track) throw new Error("لا يوجد تراك صوت");
        track.enabled = true;

        // راقب التعطّل/الإسكات من النظام
        track.onmute = () => {
          console.warn("Mic track muted — repairing...");
          repairCallerMic();
        };
        track.onended = () => {
          console.warn("Mic track ended — repairing...");
          repairCallerMic();
        };

        state.localStream = s;
        // عرض محلي (صامت لتفادي الصدى)
        if (localAudioEl) {
          localAudioEl.srcObject = s;
          localAudioEl.muted = true;
          localAudioEl.play?.().catch(()=>{});
        }
        return s;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("تعذر فتح المايك");
  }

  // استبدال التراك في نفس الـSender بدون إنهاء المكالمة
  async function repairCallerMic() {
    try {
      if (!state.pc) return;
      const newStream = await openMicFresh();
      const newTrack  = newStream.getAudioTracks()[0];
      const sender = state.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (sender && newTrack) {
        await sender.replaceTrack(newTrack);
        showToast("تم إصلاح المايك ✅", {center:true});
      }
    } catch (e) {
      console.error("repairCallerMic failed", e);
      showToast("تعذر إصلاح المايك", {center:true});
    }
  }

  // مراقبة الإرسال: لو مافيش حزم/طاقة 2-3 ثواني نصلّح
  let __OUT_T = null, __OUT_ZERO = 0;
  function startOutboundMonitor() {
    clearInterval(__OUT_T);
    __OUT_ZERO = 0;
    __OUT_T = setInterval(async () => {
      try {
        if (!state.pc) return;
        const snd = state.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (!snd) return;
        const stats = await snd.getStats();
        let packets = 0;
        stats.forEach(r => {
          if (r.type === 'outbound-rtp' && r.kind === 'audio') packets += (r.packetsSent||0);
        });
        if (packets === 0) __OUT_ZERO++; else __OUT_ZERO = 0;
        if (__OUT_ZERO >= 3) {        // ~3 ثواني بلا إرسال
          console.warn("No outbound audio — auto-repair");
          __OUT_ZERO = 0;
          await repairCallerMic();
        }
      } catch {}
    }, 1000);
  }

  // ======== المتصل (Caller) ========
  const startCall = async () => {
    if(!state.peer) return showToast("اختر محادثة أولاً",{center:true});
    unlockAudioOnce();

    // 1) افتح مايك جديد من الصفر (المهم لأندرويد 14)
    await openMicFresh();

    // 2) أنشئ اتصال جديد (إن وُجد قديم أغلقه)
    if (state.pc) { try { state.pc.close(); } catch{} }
    state.pc = createPC();

    // 3) أضف التراك الصوتي الحالي
    state.localStream.getAudioTracks().forEach(t => state.pc.addTrack(t, state.localStream));

    // 4) اضبط معدل البت للصوت
    await tuneSenderBitrate(state.pc);

    // 5) أنشئ Offer صوت فقط + عطّل VAD (بعض أجهزة 14 تصمت البداية)
    const offer = await state.pc.createOffer({
      offerToReceiveAudio:true,
      offerToReceiveVideo:false,
      voiceActivityDetection:false
    });
    await state.pc.setLocalDescription(offer);

    // 6) أرسل الـSDP بعد تأخير بسيط
    setTimeout(() => {
      socket.emit("webrtc-offer", { peer: state.peer, sdp: state.pc.localDescription });
    }, 250);

    // 7) فعّل مراقبة الإرسال (تصليح تلقائي لو وقف الإرسال)
    startOutboundMonitor();

    showToast("جاري الاتصال...", {center:true,duration:1400});
  };

  // ======== المُجيب (Callee) ========
  const acceptIncoming = async (from, sdp) => {
    unlockAudioOnce();
    state.peer = from; renderChatList();
    state.pc = createPC();

    // نحاول طريقتين: (أ) setRemote ثم getUserMedia، وإن فشلت نبدل
    try {
      await state.pc.setRemoteDescription(sdp);
      await ensureLocal();
      state.localStream.getAudioTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
    } catch(e) {
      console.warn('Accept path A failed, trying B...', e);
      await ensureLocal();
      state.localStream.getAudioTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
      await state.pc.setRemoteDescription(sdp);
    }

    await tuneSenderBitrate(state.pc);

    const answer = await state.pc.createAnswer({
      offerToReceiveAudio:true,
      offerToReceiveVideo:false,
      voiceActivityDetection:false
    });
    await state.pc.setLocalDescription(answer);

    setTimeout(() => {
      socket.emit("webrtc-answer", { peer: from, sdp: state.pc.localDescription });
    }, 200);

    hideIncoming();
    // تشغيل الصوت الوارد صراحة
    remoteAudioEl?.play?.().catch(()=>{});
    showToast("تم الاتصال ✔",{center:true,duration:1200});
  };

  const endCall = () => {
    if(state.pc){ try{state.pc.close();}catch{} state.pc=null; }
    if(state.localStream){ stopStream(state.localStream); state.localStream = null; }
    detachRemote();
    showToast("تم إنهاء المكالمة",{center:true,duration:1400});
  };

  const attachRemote = (stream)=>{
    if (remoteAudioEl) {
      remoteAudioEl.srcObject = stream;
      remoteAudioEl.playsInline = true;
      try { remoteAudioEl.muted = false; } catch(_) {}
      try { remoteAudioEl.volume = 1.0; } catch(_) {}
      remoteAudioEl.play?.().catch(()=>{ /* سيتفعل بعد أول نقرة بفضل unlock */ });
    }

    // Fallback عبر Web Audio API لو بقى صامت على Android 14
    try {
      if (!window.__AUDIO_CTX) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) window.__AUDIO_CTX = new AC();
      }
      if (window.__AUDIO_CTX && window.__AUDIO_CTX.state === "suspended") {
        window.__AUDIO_CTX.resume?.().catch(()=>{});
      }
      if (window.__AUDIO_CTX && !window.__REMOTE_SOURCE) {
        window.__REMOTE_SOURCE = window.__AUDIO_CTX.createMediaStreamSource(stream);
        window.__REMOTE_SOURCE.connect(window.__AUDIO_CTX.destination);
      }
    } catch(e) { /* ignore */ }
  };

  const detachRemote = ()=>{
    if(remoteAudioEl){ remoteAudioEl.srcObject=null; }
    if(window.__REMOTE_SOURCE){
      try { window.__REMOTE_SOURCE.disconnect(); } catch(_) {}
      window.__REMOTE_SOURCE = null;
    }
  };

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
    // تشغيل الصوت الوارد صراحة
    remoteAudioEl?.play?.().catch(()=>{});
    showToast("تم الاتصال ✔",{center:true});
  });

  socket.on("webrtc-ice", async ({ from, candidate }) => {
    if(!state.pc) return;
    try{ await state.pc.addIceCandidate(candidate);}catch(e){}
  });

  // ======== actions ========
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

  callBtn.onclick   = startCall;  // ← المايك يفتح هنا فقط (User Gesture)
  endCallBtn.onclick= endCall;

  exitChatBtn && (exitChatBtn.onclick = () => {
    if (state.peer) { try { socket.emit("leave_chat", { peer: state.peer }); } catch {} }
    state.peer = null;
    exitToList();
  });

  // ======== drawer ========
  const toggleDrawer = ()=>{
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  };
  menuBtn.onclick = toggleDrawer;
  overlay.onclick  = toggleDrawer;
  if (fab) fab.onclick = toggleDrawer;

  // ======== boot ========
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

    // Keep-alive بسيط لتخفيف الـ cold start أثناء الجلسة
    setInterval(()=>{ fetch('/healthz').catch(()=>{}); }, 240000);
  })();

  // incoming modal refs
  const incomingModal = $("#incomingModal");
  const incomingFrom  = $("#incomingFrom");
  const acceptCall    = $("#acceptCall");
  const declineCall   = $("#declineCall");
  function hideIncoming(){ incomingModal.classList.remove("show"); }
})();
