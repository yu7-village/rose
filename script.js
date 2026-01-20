import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

// --- 設定 ---
const BACKEND_URL = "https://skyway-token-backend.onrender.com";

// --- UI要素の取得 ---
const serverStatus = document.getElementById('server-status');
const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button');
const muteButton = document.getElementById('mute-button'); // 追加
const cameraButton = document.getElementById('camera-button'); // 追加
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');
const chatInput = document.getElementById('chat-input'); // 追加
const sendButton = document.getElementById('send-button'); // 追加
const chatMessages = document.getElementById('chat-messages');
const memberList = document.getElementById('member-list'); // 追加

let room, me, dataStream, localAudio, localVideoTrack;
let isMuted = false;
let isCameraOff = false;

// --- 1. バックエンドの起動確認 ---
async function checkServerStatus() {
    if (!serverStatus) return;
    try {
        const response = await fetch(BACKEND_URL + "/");
        if (response.ok) {
            serverStatus.innerText = "✅ サーバー準備完了！";
            serverStatus.style.background = "#d4edda";
            buttonJoin.disabled = false;
        }
    } catch (e) {
        serverStatus.innerText = "⏳ サーバー起動を確認中...";
        setTimeout(checkServerStatus, 5000);
    }
}
checkServerStatus();

// --- 2. メンバーリスト更新関数 ---
function updateMemberList() {
    if (!room || !memberList) return;
    memberList.innerHTML = '';
    room.members.forEach(member => {
        const li = document.createElement('li');
        // IDが長いので一部を表示
        li.textContent = `${member.id.substring(0, 8)}${member.id === me.id ? ' (自分)' : ''}`;
        memberList.appendChild(li);
    });
}

// --- 3. 入室処理 ---
buttonJoin.onclick = async () => {
    const roomName = roomNameInput.value;
    if (!roomName) return alert("ルーム名を入力してください");

    try {
        const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomName}`);
        const data = await response.json();
        const token = data.token;

        const context = await SkyWayContext.Create(token);
        room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: roomName });
        
        me = await room.join();

        // メンバーリストの初期表示と更新イベント
        updateMemberList();
        room.onMemberJoined.add(updateMemberList);
        room.onMemberLeft.add(updateMemberList);

        // 受信設定
        const subscribeAndAttach = async (publication) => {
            if (publication.publisher.id === me.id) return;
            const { stream } = await me.subscribe(publication.id);
            
            if (stream.contentType === 'data') {
                stream.onData.add(d => appendMessage(`相手: ${d}`));
            } else {
                const newMedia = document.createElement(stream.contentType === 'video' ? 'video' : 'audio');
                newMedia.id = `media-${publication.id}`;
                newMedia.playsInline = true;
                newMedia.autoplay = true;
                if (stream.contentType === 'video') newMedia.width = 300;
                stream.attach(newMedia);
                remoteMediaArea.appendChild(newMedia);
            }
        };

        room.onStreamPublished.add(e => subscribeAndAttach(e.publication));
        room.publications.forEach(subscribeAndAttach);

        // 自分のメディア公開
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        localAudio = audio; 
        localVideoTrack = video;
        video.attach(localVideo);
        
        await me.publish(localAudio);
        await me.publish(localVideoTrack);

        // データストリームの作成と公開
        dataStream = await SkyWayStreamFactory.createDataStream();
        await me.publish(dataStream);

        // UI有効化
        buttonJoin.disabled = true;
        buttonLeave.disabled = false;
        muteButton.disabled = false;
        cameraButton.disabled = false;
        sendButton.disabled = false;

    } catch (error) {
        console.error("詳細エラー:", error);
        alert("接続失敗: " + error.message);
    }
};

// --- 4. デバイス操作 (ON/OFF) ---
muteButton.onclick = () => {
    isMuted = !isMuted;
    localAudio.track.enabled = !isMuted; // トラックの有効/無効を切り替え
    muteButton.innerText = isMuted ? "マイク：OFF" : "マイク：ON";
    muteButton.style.background = isMuted ? "#ff4444" : "#007bff";
};

cameraButton.onclick = () => {
    isCameraOff = !isCameraOff;
    localVideoTrack.track.enabled = !isCameraOff; // トラックの有効/無効を切り替え
    cameraButton.innerText = isCameraOff ? "カメラ：OFF" : "カメラ：ON";
    cameraButton.style.background = isCameraOff ? "#ff4444" : "#007bff";
};

// --- 5. メッセージ送信 ---
sendButton.onclick = () => {
    if (!chatInput.value || !dataStream) return;
    
    dataStream.write(chatInput.value); // データを送信
    appendMessage(`自分: ${chatInput.value}`);
    chatInput.value = "";
};

// --- 6. 退出処理 ---
buttonLeave.onclick = () => {
    location.reload();
};

function appendMessage(text) {
    const el = document.createElement('div');
    el.innerText = text;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
