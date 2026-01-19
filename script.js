import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

// UI要素の取得
const serverStatus = document.getElementById('server-status');
const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button');
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const memberList = document.getElementById('member-list');

let room;
let me;
let dataStream;

const BACKEND_URL = "https://skyway-token-backend.onrender.com"; // あなたのRenderのURL

// --- 1. バックエンドの起動確認 (Health Check) ---
async function checkServerStatus() {
    if (!serverStatus) return;
    serverStatus.innerText = "⏳ サーバー起動を確認中（Renderスリープ復帰には約1分かかる場合があります）...";
    serverStatus.style.background = "#fff3cd";
    buttonJoin.disabled = true;

    while (true) {
        try {
            const response = await fetch(BACKEND_URL);
            if (response.ok) {
                serverStatus.innerText = "✅ サーバー準備完了！トークン発行可能です。";
                serverStatus.style.background = "#d4edda";
                buttonJoin.disabled = false;
                break;
            }
        } catch (e) {
            console.log("サーバー復帰を待機中...");
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

checkServerStatus();

// --- 2. メンバーリスト更新関数 ---
function updateMemberList() {
    if (!room || !me || !memberList) return;
    memberList.innerHTML = '';
    room.members.forEach(member => {
        const li = document.createElement('li');
        const isMe = member.id === me.id ? ' (自分)' : '';
        li.textContent = `${member.id.substring(0, 8)}${isMe}`;
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
        const { token } = data;

        const context = await SkyWayContext.Create(token);
        room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: roomNameInput.value });

        me = await room.join();
        
        updateMemberList();
        room.onMemberJoined.add(() => updateMemberList());
        room.onMemberLeft.add(({ member }) => {
            updateMemberList();
            appendMessage(`通知: 相手が退出しました`);
        });

        const subscribeAndAttach = async (publication) => {
            if (!publication || publication.publisher.id === me.id) return;
            const { stream } = await me.subscribe(publication.id);
            const mediaId = `media-${publication.id}`;

            if (stream.contentType === 'data') {
                stream.onData.add((data) => appendMessage(`相手: ${data}`));
            } else {
                let newMedia = document.createElement(stream.contentType === 'video' ? 'video' : 'audio');
                newMedia.id = mediaId;
                newMedia.playsInline = true;
                newMedia.autoplay = true;
                if (stream.contentType === 'video') newMedia.width = 300;
                stream.attach(newMedia);
                remoteMediaArea.appendChild(newMedia);
            }

            publication.onUnpublished.add(() => {
                const el = document.getElementById(mediaId);
                if (el) el.remove();
            });
        };

        room.onStreamPublished.add(({ publication }) => subscribeAndAttach(publication));
        room.publications.forEach(subscribeAndAttach);

        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);

        dataStream = await SkyWayStreamFactory.createDataStream();
        await me.publish(dataStream);

        buttonJoin.innerText = "入室中";
        buttonJoin.disabled = true;
        buttonLeave.disabled = false;

    } catch (error) {
        console.error(error);
        alert("接続失敗: " + error.message);
    }
};

// --- 4. メッセージ送信処理 ---
sendButton.onclick = () => {
    if (chatInput.value === "" || !dataStream) return;
    try {
        dataStream.write(chatInput.value); 
        appendMessage(`自分: ${chatInput.value}`);
        chatInput.value = "";
    } catch (e) { console.warn("送信失敗"); }
};

// --- 5. 退出処理 ---
buttonLeave.onclick = async () => {
    if (!room || !me) return;
    await me.leave();
    await room.dispose();
    remoteMediaArea.innerHTML = '';
    chatMessages.innerHTML = '';
    memberList.innerHTML = '';
    if (localVideo.srcObject) {
        localVideo.srcObject.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
    }
    buttonJoin.innerText = "入室する";
    buttonJoin.disabled = false;
    buttonLeave.disabled = true;
};

function appendMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.innerText = text;
    messageElement.style.borderBottom = "1px solid #eee";
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}



