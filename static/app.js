// === إعدادات عامة ===
const socket = io({ transports: ['websocket', 'polling'] });
let myNumber = null;
let currentPeer = null;
let currentRoom = null;

// WebRTC state
let pc = null;
let localStream = null;
const remoteAudio = document.getElementById('remoteAudio');

// STUN فقط (مجاني). لإنتاج مستقر أضف TURN.
const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function log(msg){ console.log('[app]', msg); }
function el(id){ return document.getElementById(id); }

// UI
const chatArea = el('chatArea');
function addMsg(text, who='system'){
  const div = document.createElement('div');
  div.className = who === 'me' ? 'chat chat-end' : (who==='peer' ? 'chat chat-start' : 'opacity-70 text-center text-sm');
  let inner = '';
  if (who==='me' || who==='peer'){
    inner = `<div class="chat-bubble">${text}</div>`;
  } else {
    inner = `<span>${text}</span>`;
  }
  div.innerHTML = inner;
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// حفظ/جلب الرقم
function getStoredNumber(){
  try { return localStorage.getItem('myNumber'); } catch(e){ return null; }
}
function setStoredNumber(n){
  try { localStorage.setItem('myNumber', n); } catch(e){}
}

async function ensureNumber(){
  let n = getStoredNumber();
  if (!n){
    const r = await fetch('/alloc');
    const j = await r.json();
    n = j.number;
    setStoredNumber(n);
  }
  myNumber = n;
  el('myNumber').textContent = n;
  // share link
  el('shareLink').href = `/?to=${encodeURIComponent(n)}`;
}

// Socket events
socket.on('connect', () => log('connected'));
socket.on('server_info', d => log(d));
socket.on('registered', d => { addMsg(`تم تسجيلك بالرقم ${d.number}`); });
socket.on('presence', d => log(['presence', d]));
socket.on('system', p => addMsg(p.text, 'system'));
socket.on('chat_ready', p => {
  currentRoom = p.room;
  addMsg(`المحادثة جاهزة مع ${p.with}`, 'system');
});
socket.on('message', p => {
  const who = (p.from === myNumber) ? 'me' : 'peer';
  addMsg(p.text, who);
});
socket.on('typing', p => {
  // يمكن إضافة مؤشر "يكتب الآن" هنا
});

// WebRTC
socket.on('webrtc-offer', async ({from, sdp}) => {
  if (!currentPeer) currentPeer = from;
  await ensurePC();
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  await ensureLocalStream();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('webrtc-answer', { peer: currentPeer, sdp: answer });
  addMsg('📞 جارٍ الرد على الاتصال…', 'system');
});

socket.on('webrtc-answer', async ({from, sdp}) => {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  addMsg('✅ تم قبول المكالمة', 'system');
});

socket.on('webrtc-ice', async ({from, candidate}) => {
  if (!pc || !candidate) return;
  try {
    await pc.addIceCandidate(candidate);
  } catch (e) { console.error('addIceCandidate failed', e); }
});

async function ensurePC(){
  if (pc) return pc;
  pc = new RTCPeerConnection(RTC_CONFIG);
  pc.onicecandidate = (e) => {
    if (e.candidate && currentPeer){
      socket.emit('webrtc-ice', { peer: currentPeer, candidate: e.candidate });
    }
  };
  pc.ontrack = (e) => {
    remoteAudio.srcObject = e.streams[0];
  };
  pc.onconnectionstatechange = () => {
    log('pc state: ' + pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed'){
      endCall();
    }
  };
  return pc;
}

async function ensureLocalStream(){
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return localStream;
}

// Actions
async function startChat(){
  const peer = el('peerInput').value.trim();
  if (!peer) return;
  currentPeer = peer;
  socket.emit('start_chat', { peer });
  addMsg(`بدأت محادثة مع ${peer}`, 'system');
}

async function sendMsg(){
  const txt = el('msgInput').value.trim();
  if (!txt || !currentPeer) return;
  socket.emit('message', { peer: currentPeer, text: txt });
  el('msgInput').value = '';
}

async function startCall(){
  if (!currentPeer){ addMsg('اختر رقمًا لبدء المكالمة', 'system'); return; }
  await ensurePC();
  await ensureLocalStream();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('webrtc-offer', { peer: currentPeer, sdp: offer });
  addMsg('📞 جاري الاتصال…', 'system');
}

function endCall(){
  if (pc){
    try { pc.getSenders().forEach(s => { try { s.track.stop(); } catch(e){} }); } catch(e){}
    try { pc.getReceivers().forEach(r => { try { r.track.stop(); } catch(e){} }); } catch(e){}
    try { pc.close(); } catch(e){}
    pc = null;
  }
  if (localStream){
    try { localStream.getTracks().forEach(t => t.stop()); } catch(e){}
    localStream = null;
  }
  addMsg('☎️ تم إنهاء المكالمة', 'system');
}

// UI bindings
window.addEventListener('DOMContentLoaded', async () => {
  await ensureNumber();
  socket.emit('register', { number: myNumber });

  // لو الرابط يحمل ?to=
  const params = new URLSearchParams(location.search);
  const to = params.get('to');
  if (to){ el('peerInput').value = to; startChat(); }

  el('startChat').onclick = startChat;
  el('sendBtn').onclick = sendMsg;
  el('msgInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMsg();
  });

  el('callBtn').onclick = startCall;
  el('endCallBtn').onclick = endCall;

  el('copyMyNumber').onclick = async () => {
    await navigator.clipboard.writeText(myNumber);
  };
});
