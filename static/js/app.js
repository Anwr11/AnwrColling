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
  // لو أنت في آخر المحادثة يثبت True؛ لو طلعت لفوق يصير False، فنحترم قراءتك
  let stickBottom = true;
  const nearBottom = () =>
    (messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 8);

  const scrollToBottom = (force = false) => {
    if (force || stickBottom) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  };

  // نراقب سلوكك في التمرير
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

    // المحادثات المحفوظة
    for (const [p, meta] of state.chats.entries()) {
      const li = document.createElement("li");
      li.className = "chat-item" + (state.peer === p ? " active" : "");
      li.innerHTML =
        `<span class="status-dot ${meta.online ? "status-online" : ""}"></span>` +
        `<span>${p}${meta.unread ? ` (${meta.unread})` : ""}</span>`;
      li.onclick = () => switchPeer(p);
      chatList.appendChild(li);
    }

    // عنصر الخروج كآخر عنصر في القائمة
    const exitItem = document.createElement("li");
    exitItem.className = "chat-item exit" + (!state.peer ? " disabled" : "");
    exitItem.innerHTML =
      `<span class="exit-ico">🚪</span>` +
      `<span>${state.peer ? "الخروج من المحادثة الحالية" : "لا توجد محادثة للخروج"}</span>`;

    exitItem.onclick = () => {
      if (!state.peer) return;                 // لا يعمل إن لم تكن داخل محادثة
      try { socket.emit("leave_chat", { peer: state.peer }); } catch {}
      state.peer = null;
      exitToList();                             // نفس دالة الخروج المعتادة
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
    // ننزل لأسفل فوراً
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
    // لما تفتح محادثة خلك مثبت تحت
    stickBottom = true; scrollToBottom(true);
  };

  // ======== socket.io ========
  const socket = io({ transports:["websocket"], autoConnect:false });
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
    scrollToBottom(); // ← يحترم كونك تقرأ فوق أو لا
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

    // اتبع أسفل الرسائل فقط لو كنت أساساً بالأسفل
    scrollToBottom();

    if(p.from!==state.me && fromPeer!==state.peer){
      state.chats.get(fromPeer).unread++;
      renderChatList();
    }
  });

  // ======== WebRTC (stubs) ========
  const createPC = () => {
    const pc = new RTCPeerConnection({ iceServers:[{urls:"stun:stun.l.google.com:19302"}] });
    pc.onicecandidate = e => { if(e.candidate && state.peer) socket.emit("webrtc-ice", { peer: state.peer, candidate: e.candidate }); };
    pc.ontrack = e => attachRemote(e.streams[0]);
    pc.onconnectionstatechange = () => { if(["disconnected","failed","closed"].includes(pc.connectionState)) endCall(); };
    return pc;
  };
  const ensureLocal = async () => {
    if(state.localStream) return state.localStream;
    const s = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
    state.localStream = s; return s;
  };
  const startCall = async () => {
    if(!state.peer) return showToast("اختر محادثة أولاً",{center:true});
    await ensureLocal();
    state.pc = createPC();
    state.localStream.getTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
    await state.pc.setLocalDescription(await state.pc.createOffer());
    socket.emit("webrtc-offer", { peer: state.peer, sdp: state.pc.localDescription });
    showToast("جاري الاتصال...", {center:true,duration:1400});
  };
  const acceptIncoming = async (from, sdp) => {
    await ensureLocal();
    state.peer = from; renderChatList();
    state.pc = createPC();
    state.localStream.getTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
    await state.pc.setRemoteDescription(sdp);
    await state.pc.setLocalDescription(await state.pc.createAnswer());
    socket.emit("webrtc-answer", { peer: from, sdp: state.pc.localDescription });
    hideIncoming();
    showToast("تم الاتصال ✔",{center:true,duration:1200});
  };
  const endCall = () => {
    if(state.pc){ try{state.pc.close();}catch{} state.pc=null; }
    detachRemote();
    showToast("تم إنهاء المكالمة",{center:true,duration:1400});
  };
  const attachRemote = (stream)=>{
    let el=document.getElementById("remoteAudio");
    if(!el){ el=document.createElement("audio"); el.id="remoteAudio"; el.autoplay=true; document.body.appendChild(el); }
    el.srcObject=stream;
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
    renderChatList(); // ← حدّث القائمة عشان زر الخروج يتعطل إذا ما في محادثة
  };

  sendBtn.onclick = () => {
    const text = msgBox.value.trim();
    if(!text||!state.peer) return;
    socket.emit("message",{ peer:state.peer, text });
    msgBox.value="";
    // أنت الآن كتبت رسالة، عادة تكون عند الأسفل
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
  callBtn.onclick = startCall; endCallBtn.onclick = endCall;

  // ======== Exit current chat (زر الموجود فوق الكومبوزر إن كان موجود) ========
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
  if (fab) fab.onclick = toggleDrawer;   // آمن لو حذفت زر +

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
  })();

  // incoming modal refs
  const incomingModal = $("#incomingModal");
  const incomingFrom = $("#incomingFrom");
  const acceptCall = $("#acceptCall");
  const declineCall = $("#declineCall");
  function hideIncoming(){ incomingModal.classList.remove("show"); }
})();
