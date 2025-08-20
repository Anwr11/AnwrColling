// === Socket.IO ===
const socket = io({ transports: ['websocket', 'polling'] });
let myNumber = null;
let currentPeer = null;
let currentRoom = null;

// محادثات متعددة: تاريخ لكل رقم
const chatHistory = {};   // {peer: [{who:'me'|'peer'|'system', text, ts}, ...]}
const recentPeers = new Set();

const remoteAudio = document.getElementById('remoteAudio');
const callModal = document.getElementById('callModal');
const callerNumEl = document.getElementById('callerNum');

let pc = null;
let localStream = null;

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function el(id){ return document.getElementById(id); }
const chatArea = el('chatArea');

function pushMsg(peer, who, text){
  if(!chatHistory[peer]) chatHistory[peer] = [];
  chatHistory[peer].push({who, text, ts: Date.now()});
  if (peer === currentPeer) renderChat(peer);
}

function renderChat(peer){
  el('peerLabel').textContent = peer || '—';
  chatArea.innerHTML = '';
  (chatHistory[peer] || []).forEach(m => {
    if (m.who === 'system'){
      const div = document.createElement('div');
      div.className = 'opacity-70 text-center text-sm';
      div.textContent = m.text;
      chatArea.appendChild(div);
    } else {
      const div = document.createElement('div');
      div.className = (m.who === 'me') ? 'chat chat-end' : 'chat chat-start';
      div.innerHTML = `<div class="chat-bubble">${m.text}</div>`;
      chatArea.appendChild(div);
    }
  });
  chatArea.scrollTop = chatArea.scrollHeight;
}

function renderRecents(){
  const list = el('recentList');
  list.innerHTML = '';
  Array.from(recentPeers).forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<a>${p}</a>`;
    li.onclick = () => { el('peerInput').value = p; startChat(); };
    list.appendChild(li);
  });
}

// رقم المستخدم
function getStoredNumber(){ try { return localStorage.getItem('myNumber'); } catch(e){ return null; } }
function setStoredNumber(n){ try { localStorage.setItem('myNumber', n); } catch(e){} }

async function ensureNumber(){
  let n = getStoredNumber();
  if (!n){
    const r = await fetch('/alloc'); const j = await r.json(); n = j.number; setStoredNumber(n);
  }
  myNumber = n;
  el('myNumber').textContent = n;
  el('shareLink').href = `/?to=${encodeURIComponent(n)}`;
}

// WebRTC helpers
async function ensurePC(){
  if (pc) return pc;
  pc = new RTCPeerConnection(RTC_CONFIG);
  pc.onicecandidate = (e) => {
    if (e.candidate && currentPeer){
      socket.emit('webrtc-ice', { peer: currentPeer, candidate: e.candidate });
    }
  };
  pc.ontrack = (e) => { remoteAudio.srcObject = e.streams[0]; };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (['disconnected','failed','closed'].includes(st)) endCall();
  };
  return pc;
}
async function ensureLocalStream(){
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return localStream;
}
function endCall(){
  if (pc){
    try { pc.getSenders().forEach(s => s.track && s.track.stop()); } catch(e){}
    try { pc.close(); } catch(e){}
    pc = null;
  }
  if (localStream){
    try { localStream.getTracks().forEach(t => t.stop()); } catch(e){}
    localStream = null;
  }
  if (currentPeer) pushMsg(currentPeer, 'system', '☎️ تم إنهاء المكالمة');
}

// Actions
async function startChat(){
  const peer = el('peerInput').value.trim();
  if (!peer) return;
  currentPeer = peer;
  recentPeers.add(peer);
  renderRecents();
  socket.emit('start_chat', { peer });
  pushMsg(peer, 'system', `بدأت محادثة مع ${peer}`);
  renderChat(peer);
}

async function sendMsg(){
  const txt = el('msgInput').value.trim();
  if (!txt || !currentPeer) return;
  socket.emit('message', { peer: currentPeer, text: txt });
  el('msgInput').value = '';
  pushMsg(currentPeer, 'me', txt);
}

async function startCall(){
  if (!currentPeer){ pushMsg('system','system','اختر رقمًا أولًا'); return; }
  await ensurePC();
  await ensureLocalStream();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('webrtc-offer', { peer: currentPeer, sdp: offer });
  pushMsg(currentPeer, 'system', '📞 جارٍ الاتصال…');
}

// قبول/رفض
function showIncoming(from){
  callerNumEl.textContent = from;
  callModal.showModal();
  el('acceptCall').onclick = async () => {
    callModal.close();
    currentPeer = from;
    await ensurePC();
    await ensureLocalStream();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    if (window.__lastOffer){
      await pc.setRemoteDescription(new RTCSessionDescription(window.__lastOffer.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { peer: window.__lastOffer.from, sdp: answer });
      pushMsg(window.__lastOffer.from, 'system', '✅ تم قبول المكالمة');
      window.__lastOffer = null;
    }
  };
  el('rejectCall').onclick = () => {
    callModal.close();
    socket.emit('webrtc-reject', { peer: from });
    pushMsg(from, 'system', '❌ تم رفض المكالمة');
  };
}

// Socket events
socket.on('connect', () => {});
socket.on('registered', d => { /* ready */ });
socket.on('system', p => pushMsg(currentPeer || 'system', 'system', p.text));
socket.on('chat_ready', p => { currentRoom = p.room; });

socket.on('message', p => {
  const who = (p.from === myNumber) ? 'me' : 'peer';
  const peerKey = (who === 'peer') ? p.from : currentPeer;
  pushMsg(peerKey, who, p.text);
});

socket.on('webrtc-offer', async ({from, sdp}) => {
  // إظهار نافذة قبول/رفض — لا نرد تلقائيًا
  recentPeers.add(from);
  renderRecents();
  window.__lastOffer = {from, sdp};
  showIncoming(from);
});

socket.on('webrtc-answer', async ({from, sdp}) => {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  pushMsg(currentPeer, 'system', '✅ تم قبول المكالمة');
});

socket.on('webrtc-reject', ({from}) => {
  pushMsg(from, 'system', '🚫 الطرف الآخر رفض المكالمة');
  endCall();
});

// UI bindings
window.addEventListener('DOMContentLoaded', async () => {
  await ensureNumber();
  socket.emit('register', { number: myNumber });

  // ?to=...
  const params = new URLSearchParams(location.search);
  const to = params.get('to');
  if (to){ el('peerInput').value = to; startChat(); }

  el('startChat').onclick = startChat;
  el('sendBtn').onclick = sendMsg;
  el('msgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
  el('callBtn').onclick = startCall;
  el('endCallBtn').onclick = endCall;
  el('copyMyNumber').onclick = async () => { await navigator.clipboard.writeText(myNumber); };
});
