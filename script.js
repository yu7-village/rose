import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

// --- 設定 ---
const BACKEND_URL = "https://skyway-token-backend.onrender.com";

// --- UI要素の取得 ---
const serverStatus = document.getElementById('server-status');
const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button');
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');
const chatMessages = document.getElementById('chat-messages');

let room, me, dataStream;

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

// --- 2. 入室処理 ---
buttonJoin.onclick = async () => {
    const roomName = roomNameInput.value;
    if (!roomName) return alert("ルーム名を入力してください");

    try {
        // A. トークン取得
        const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomName}`);
        if (!response.ok) throw new Error("サーバーからトークンを取得できませんでした");
        const data = await response.json();
        const token = data.token;

        // B. Contextの作成 (failed to decodeエラーが出るのはここです)
        const context = await SkyWayContext.Create(token);

        // C. ルーム参加 (P2P)
        room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: roomName });
        me = await room.join();

        // D. 受信設定（映像・音声・データ）
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

        // E. 自分のメディア（カメラ・マイク）公開
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);

        // チャット用データストリーム
        dataStream = await SkyWayStreamFactory.createDataStream();
        await me.publish(dataStream);

        buttonJoin.disabled = true;
        buttonLeave.disabled = false;

    } catch (error) {
        console.error("詳細エラー:", error);
        alert("接続失敗: " + error.message);
    }
};

// --- 3. 退出処理 ---
buttonLeave.onclick = () => {
    location.reload(); // 確実にリセットするためリロード
};

function appendMessage(text) {
    const el = document.createElement('div');
    el.innerText = text;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
