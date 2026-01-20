import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

// UI要素の取得
const serverStatus = document.getElementById('server-status');
const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button');
const muteButton = document.getElementById('mute-button');
const cameraButton = document.getElementById('camera-button');
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const memberList = document.getElementById('member-list');

let room, me, dataStream, localAudio, localVideoTrack;
let isMuted = false;
let isCameraOff = false;

const BACKEND_URL = "https://skyway-token-backend.onrender.com";

// --- 1. バックエンドの起動確認 ---
async function checkServerStatus() {
    if (!serverStatus) return;
    serverStatus.innerText = "⏳ サーバー起動を確認中...";
    try {
        const response = await fetch(BACKEND_URL);
        if (response.ok) {
            serverStatus.innerText = "✅ サーバー準備完了！";
            serverStatus.style.background = "#d4edda";
            buttonJoin.disabled = false;
        }
    } catch (e) {
        setTimeout(checkServerStatus, 5000);
    }
}
checkServerStatus();

// --- 2. メンバーリスト更新 ---
function updateMemberList() {
    if (!room || !memberList) return;
    memberList.innerHTML = '';
    room.members.forEach(member => {
        const li = document.createElement('li');
        li.textContent = `${member.id.substring(0, 8)}${member.id === me.id ? ' (自分)' : ''}`;
        li.style.cssText = "background:#eee; padding:2px 8px; border-radius:4px; font-size:12px;";
        memberList.appendChild(li);
    });
}

// --- 3. 入室処理 ---
buttonJoin.onclick = async () => {
    if (roomNameInput.value === "") return;
    try {
        const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomNameInput.value}`);
        const data = await response.json();
        const token = data.token;

        const context = await SkyWayContext.Create(token);
        room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: roomNameInput.value });

        me = await room.join();
        updateMemberList();
        room.onMemberJoined.add(updateMemberList);
        room.onMemberLeft.add(updateMemberList);

        const subscribeAndAttach = async (publication) => {
            if (publication.publisher.id === me.id) return;
            const { stream } = await me.subscribe(publication.id);
            if (stream.contentType === 'data') {
                stream.onData.add(data => appendMessage(`相手: ${data}`));
            } else {
                const newMedia = document.createElement(stream.contentType === 'video' ? 'video' : 'audio');
                newMedia.id = `media-${publication.id}`;
                newMedia.playsInline = true;
                newMedia.autoplay = true;
                if (stream.contentType === 'video') newMedia.width = 300;
                stream.attach(newMedia);
                remoteMediaArea.appendChild(newMedia);
            }
            publication.onUnpublished.add(() => document.getElementById(`media-${publication.id}`)?.remove());
        };

        room.onStreamPublished.add(({ publication }) => subscribeAndAttach(publication));
        room.publications.forEach(subscribeAndAttach);

        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        localAudio = audio; localVideoTrack = video;
        video.attach(localVideo);
        await me.publish(localAudio);
        await me.publish(localVideoTrack);
        dataStream = await SkyWayStreamFactory.createDataStream();
        await me.publish(dataStream);

        muteButton.disabled = cameraButton.disabled = false;
        buttonJoin.disabled = true; buttonLeave.disabled = false;
    } catch (error) {
        console.error(error);
        alert("接続失敗: " + error.message);
    }
};

// --- 4. デバイス操作 ---
muteButton.onclick = () => {
    isMuted = !isMuted;
    localAudio.track.enabled = !isMuted;
    muteButton.innerText = isMuted ? "マイク：OFF" : "マイク：ON";
};
cameraButton.onclick = () => {
    isCameraOff = !isCameraOff;
    localVideoTrack.track.enabled = !isCameraOff;
    cameraButton.innerText = isCameraOff ? "カメラ：OFF" : "カメラ：ON";
};

// --- 5. メッセージ送信 ---
sendButton.onclick = () => {
    if (!chatInput.value || !dataStream) return;
    dataStream.write(chatInput.value);
    appendMessage(`自分: ${chatInput.value}`);
    chatInput.value = "";
};

// --- 6. 退出処理 ---
buttonLeave.onclick = async () => {
    location.reload(); // 全リセットのためリロード
};

function appendMessage(text) {
    const el = document.createElement('div');
    el.innerText = text;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
