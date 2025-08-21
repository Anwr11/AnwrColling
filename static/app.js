let socket = io();
let pc;
let localStream;

function joinRoom() {
    let room = document.getElementById('room').value;
    socket.emit('join', {room: room, user: 'مستخدم'});
    socket.on('status', data => {
        document.getElementById('status').innerText = data.msg;
    });
    socket.on('signal', async (data) => {
        if (data.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            let answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', {room: room, type:'answer', answer: answer});
        } else if (data.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.type === 'candidate') {
            try { await pc.addIceCandidate(data.candidate); } catch(e){}
        }
    });
}

async function startCall() {
    let room = document.getElementById('room').value;
    pc = new RTCPeerConnection();
    localStream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {room: room, type:'candidate', candidate: event.candidate});
        }
    };
    pc.ontrack = (event) => {
        let audio = document.createElement('audio');
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        document.body.appendChild(audio);
    };
    let offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', {room: room, type:'offer', offer: offer});
}

function endCall() {
    if (pc) {
        pc.close();
        pc = null;
        document.getElementById('status').innerText = "تم إنهاء المكالمة.";
    }
}
