(() => {
  const $ = s => document.querySelector(s);
  const messagesEl = $("#messages");
  const chatList = $("#chatList");
  const peerTitle = $("#peerTitle");
  const peerSub = $("#peerSub");
  const msgBox = $("#msgBox");
  const sendBtn = $("#sendBtn");
  const startChatBtn = $("#startChatBtn");
  const peerInput = $("#peerInput");
  const meNumberEl = $("#meNumber");
  const copyMyNumber = $("#copyMyNumber");
  const callBtn = $("#callBtn");
  const endCallBtn = $("#endCallBtn");
  const muteBtn = $("#muteBtn");
  const menuBtn = $("#menuBtn");
  const sidebar = $("#sidebar");
  const overlay = $("#overlay");
  const fab = $("#fab");            // آمن حتى لو حذفته من HTML
  const exitChatBtn = $("#exitChat");
  const toast = $("#toast");

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
  // نفعل عند أول نقرة في الصفحة
  document.addEventListener('click', unlockAudioOnce, { once: true });

  // ======== Toast helper (center option) ========
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

  messagesEl.addEventListener("scroll", () => {
    stickBottom = nearBottom();
  });

  const state = { me:null, peer:null, dnd:false, chats:new Map(), pc:null, localStream:null, muted:false };

  const saveLocal = () => {
    localStorage.setItem("colling:me", state.me||"");
    localStorage.setItem("colling:chats", JSON.stringify([...state.chats.keys()]));
  };
  const loadLocal = () => {
    state.me = localStorage.getItem("colling:me")||null;
    try {
      JSON.parse(localStorage.getItem("colling:chats")||"[]")
        .forEach(p=>state.chats.set(p,{unread:0,online:false}));
    } catch{}
  };

  // ======== قائمة المحادثات + زر الخروج كآخر عنصر ========
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

  // ======== socket.io ========
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
  // STUN + ترانسيڤر للصوت لإجبار إنشاء m-line للصوت
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

  // إعادة محاولة للمايك + إعدادات صوت تخفف المشاكل
  const getMicStream = async () => {
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 },
        video: false
      });
    } catch(e) {
      console.warn("Retrying mic request...", e);
      s = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
    }
    return s;
  };

  const ensureLocal = async () => {
    if(state.localStream) return state.localStream;
    const s = await getMicStream();
    state.localStream = s;
    return s;
  };

  const startCall = async () => {
    if(!state.peer) return showToast("اختر محادثة أولاً",{center:true});
    unlockAudioOnce();

    await ensureLocal();
    state.pc = createPC();
    state.localStream.getTracks().forEach(t=>state.pc.addTrack(t,state.localStream));

    // خفض البت للصوت لتحسين الثبات على شبكات ضعيفة/أندرويد 14
    try {
      const snd = state.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (snd && snd.getParameters) {
        const p = snd.getParameters();
        p.encodings = [{ maxBitrate: 24000 }]; // ~24 kbps
        await snd.setParameters(p);
      }
    } catch(_) {}

    const offer = await state.pc.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:false });
    await state.pc.setLocalDescription(offer);

    // تأخير بسيط مفيد لأندرويد 14
    setTimeout(() => {
      socket.emit("webrtc-offer", { peer: state.peer, sdp: state.pc.localDescription });
    }, 250);

    showToast("جاري الاتصال...", {center:true,duration:1400});
  };

  const acceptIncoming = async (from, sdp) => {
    unlockAudioOnce();
    state.peer = from; renderChatList();
    state.pc = createPC();

    // طريقتان — بعض أجهزة أندرويد 14 تحتاج ترتيب مختلف
    try {
      await state.pc.setRemoteDescription(sdp);
      await ensureLocal();
      state.localStream.getTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
    } catch(e) {
      console.warn('Accept path A failed, trying B...', e);
      await ensureLocal();
      state.localStream.getTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
      await state.pc.setRemoteDescription(sdp);
    }

    const answer = await state.pc.createAnswer({ offerToReceiveAudio:true, offerToReceiveVideo:false });
    await state.pc.setLocalDescription(answer);

    setTimeout(() => {
      socket.emit("webrtc-answer", { peer: from, sdp: state.pc.localDescription });
    }, 200);

    hideIncoming();
    showToast("تم الاتصال ✔",{center:true,duration:1200});
  };

  const endCall = () => {
    if(state.pc){ try{state.pc.close();}catch{} state.pc=null; }
    if(state.localStream){
      try{ state.localStream.getTracks().forEach(t=>t.stop()); }catch{}
      state.localStream = null;
    }
    detachRemote();
    showToast("تم إنهاء المكالمة",{center:true,duration:1400});
  };

  const attachRemote = (stream)=>{
    let el=document.getElementById("remoteAudio");
    if(!el){
      el=document.createElement("audio");
      el.id="remoteAudio";
      el.autoplay=true;
      el.playsInline = true;
      document.body.appendChild(el);
    }
    el.srcObject=stream;
    // تشغيل صريح — يحل مشكلة عدم سماع الصوت على أندرويد 14
    el.play?.().catch(()=>{ /* سيتفعل بعد أول نقرة بفضل unlock */ });
  };

  const detachRemote = ()=>{
    const el=document.getElementById("remoteAudio");
    if(el){ el.srcObject=null; el.remove(); }
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

  callBtn.onclick = startCall;
  endCallBtn.onclick = endCall;

  // ======== Exit current chat ========
  exitChatBtn && (exitChatBtn.onclick = () => {
    if (state.peer) {
      try { socket.emit("leave_chat", { peer: state.peer }); } catch {}
    }
    state.peer = null;
    exitToList();
  });

  // ======== drawer ========
  const toggleDrawer = ()=>{
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  };
  menuBtn.onclick = toggleDrawer;
  overlay.onclick = toggleDrawer;
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
  const incomingFrom = $("#incomingFrom");
  const acceptCall = $("#acceptCall");
  const declineCall = $("#declineCall");
  function hideIncoming(){ incomingModal.classList.remove("show"); }
})();
