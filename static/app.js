
// === Socket.IO ===
const socket = io({ transports: ['websocket', 'polling'] });
let myNumber = null;
let currentPeer = null;
let currentRoom = null;

// محادثات متعددة
const chatHistory = {};   // {peer: [{who:'me'|'peer'|'system', text, ts}, ...]}
const recentPeers = new Set();

// فيديو
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
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
  el('peerInput').value = peer || '';
  chatArea.innerHTML = '';
  (chatHistory[peer] || []).forEach(m => {
    if (m.who === 'system'){
      const div = document.createElement('div');
      div.className = 'kv';
      div.style.textAlign = 'center';
      div.textContent = m.text;
      chatArea.appendChild(div);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'bubble ' + (m.who === 'me' ? 'me' : 'peer');
      wrap.textContent = m.text;
      chatArea.appendChild(wrap);
    }
  });
  chatArea.scrollTop = chatArea.scrollHeight;
}

function renderRecents(){
  const list = el('recentList');
  list.innerHTML = '';
  Array.from(recentPeers).forEach(p => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.textContent = p;
    a.href = '#';
    a.onclick = (e)=>{e.preventDefault(); el('peerInput').value = p; startChat();};
    li.appendChild(a);
    list.appendChild(li);
  });
}

function getStoredNumber(){ try { return localStorage.getItem('myNumber'); } catch(e){ return null; } }
function setStoredNumber(n){ try { localStorage.setItem('myNumber', n); } catch(e){} }

async function ensureNumber(){
  let n = getStoredNumber();
  if (!n){
    const r = await fetch('/alloc'); const j = await r.json(); n = j.number; setStoredNumber(n);
  }
  myNumber = n;
  el('myNumber').textContent = n;
}

async function ensurePC(){
  if (pc) return pc;
  pc = new RTCPeerConnection(RTC_CONFIG);
  pc.onicecandidate = (e) => {
    if (e.candidate && currentPeer){
      socket.emit('webrtc-ice', { peer: currentPeer, candidate: e.candidate });
    }
  };
  pc.ontrack = (e) => { remoteVideo.srcObject = e.streams[0]; };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (['disconnected','failed','closed'].includes(st)) endCall();
  };
  return pc;
}
async function ensureLocalStream(video=true){
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
  localVideo.srcObject = localStream;
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

async function startVideoCall(){
  if (!currentPeer){ toast('اختر رقمًا أولًا'); return; }
  await ensurePC();
  await ensureLocalStream(true);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('webrtc-offer', { peer: currentPeer, sdp: offer });
  pushMsg(currentPeer, 'system', '📹 جارٍ الاتصال…');
}

// قبول/رفض
function showIncoming(from){
  el('callerNum').textContent = from;
  const modal = document.getElementById('callModal');
  modal.style.display = 'flex';
  el('acceptCall').onclick = async () => {
    modal.style.display = 'none';
    currentPeer = from;
    await ensurePC();
    await ensureLocalStream(true);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    if (window.__lastOffer){
      await pc.setRemoteDescription(new RTCSessionDescription(window.__lastOffer.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { peer: window.__lastOffer.from, sdp: answer });
      pushMsg(window.__lastOffer.from, 'system', '✅ تم قبول مكالمة الفيديو');
      window.__lastOffer = null;
    }
  };
  el('rejectCall').onclick = () => {
    modal.style.display = 'none';
    socket.emit('webrtc-reject', { peer: from });
    pushMsg(from, 'system', '❌ تم رفض المكالمة');
  };
}

// Socket events
socket.on('connect', () => {});
socket.on('registered', d => {});
socket.on('system', p => pushMsg(currentPeer || 'system', 'system', p.text));
socket.on('chat_ready', p => { currentRoom = p.room; });

socket.on('message', p => {
  const who = (p.from === myNumber) ? 'me' : 'peer';
  const peerKey = (who === 'peer') ? p.from : currentPeer;
  pushMsg(peerKey, who, p.text);
});

socket.on('webrtc-offer', async ({from, sdp}) => {
  recentPeers.add(from); renderRecents();
  window.__lastOffer = {from, sdp};
  showIncoming(from);
});

socket.on('webrtc-answer', async ({from, sdp}) => {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  pushMsg(currentPeer, 'system', '✅ تم قبول مكالمة الفيديو');
});

socket.on('webrtc-reject', ({from}) => {
  pushMsg(from, 'system', '🚫 الطرف الآخر رفض المكالمة');
  endCall();
});

window.addEventListener('DOMContentLoaded', async () => {
  await ensureNumber();
  socket.emit('register', { number: myNumber });

  const params = new URLSearchParams(location.search);
  const to = params.get('to');
  if (to){ el('peerInput').value = to; startChat(); }

  el('startChat').onclick = startChat;
  el('sendBtn').onclick = sendMsg;
  el('msgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
  el('callBtn').onclick = startVideoCall;
  el('endCallBtn').onclick = endCall;
});
