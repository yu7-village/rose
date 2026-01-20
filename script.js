import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

// 1. あなたのバックエンドURL（末尾のスラッシュなしが推奨）
const BACKEND_URL = "https://skyway-token-backend.onrender.com";

// 2. HTML要素の取得
const serverStatus = document.getElementById('server-status');
const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button');
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');
const chatMessages = document.getElementById('chat-messages');

let room, me, dataStream;

/**
 * サーバーの起動状態をチェックする関数
 */
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

// 起動時にサーバーチェックを開始
checkServerStatus();

/**
 * 入室ボタンクリック時の処理
 */
buttonJoin.onclick = async () => {
    if (!roomNameInput.value) {
        alert("ルーム名を入力してください");
        return;
    }

    try {
        // --- 手順A: バックエンドからトークンを取得 ---
        const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomNameInput.value}`);
        if (!response.ok) throw new Error("トークンの取得に失敗しました");
        
        const data = await response.json();
        const token = data.token;

        // --- 手順B: SkyWayコンテキストの作成 (ここでデコードが行われます) ---
        const context = await SkyWayContext.Create(token);

        // --- 手順C: ルームへの参加 (P2Pモード) ---
        room = await SkyWayRoom.FindOrCreate(context, { 
            type: 'p2p', 
            name: roomNameInput.value 
        });

        me = await room.join();

        // --- 手順D: 他の参加者のストリームを受信する設定 ---
        const subscribeAndAttach = async (publication) => {
            if (publication.publisher.id === me.id) return;

            const { stream } = await me.subscribe(publication.id);
            
            if (stream.contentType === 'data') {
                // チャットデータの受信
                stream.onData.add(d => {
                    appendMessage(`相手: ${d}`);
                });
            } else {
                // 映像・音声の受信
                const newMedia = document.createElement(stream.contentType === 'video' ? 'video' : 'audio');
                newMedia.id = `media-${publication.id}`;
                newMedia.playsInline = true;
                newMedia.autoplay = true;
                if (stream.contentType === 'video') newMedia.width = 300;
                stream.attach(newMedia);
                remoteMediaArea.appendChild(newMedia);
            }
        };

        // すでに公開されているストリームを購読
        room.publications.forEach(subscribeAndAttach);
        // 新しく公開されたストリームを購読
        room.onStreamPublished.add(e => subscribeAndAttach(e.publication));

        // --- 手順E: 自分の映像・音声を公開 ---
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        
        await me.publish(audio);
        await me.publish(video);
        
        // チャット用のデータストリームを公開
        dataStream = await SkyWayStreamFactory.createDataStream();
        await me.publish(dataStream);

        // UIの状態更新
        buttonJoin.disabled = true;
        buttonLeave.disabled = false;

    } catch (error) {
        console.error("詳細エラー:", error);
        alert("接続失敗: " + error.message);
    }
};

/**
 * 退室（リロード）
 */
buttonLeave.onclick = () => {
    location.reload();
};

/**
 * チャットメッセージを画面に表示する
 */
function appendMessage(text) {
    const el = document.createElement('div');
    el.innerText = text;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
