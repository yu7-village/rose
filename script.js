// script.js - テキストチャット・退出機能付き完全版
import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

// UI要素の取得
const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button');
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');

// チャットUI要素
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');

let room;
let me;
let dataStream; // チャット用ストリーム

// --- 入室処理 ---
buttonJoin.onclick = async () => {
    if (roomNameInput.value === "") return;

    try {
        // 1. トークンの取得
        const response = await fetch(`https://skyway-token-backend.onrender.com/api/skyway-token?roomId=${roomNameInput.value}`);
        const data = await response.json();
        const { token } = data;

        // 2. SkyWayの初期化
        const context = await SkyWayContext.Create(token);

        room = await SkyWayRoom.FindOrCreate(context, {
            type: 'p2p',
            name: roomNameInput.value,
        });

        me = await room.join();
        console.log("入室完了:", me.id);

        // 3. メディア（映像・音声）の公開
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);

        // 4. チャット用データストリームの公開
        dataStream = await SkyWayStreamFactory.createDataStream();
        await me.publish(dataStream);

        // 5. 相手のストリームを購読する関数
        const subscribeAndAttach = async (publication) => {
            if (!publication || publication.publisher.id === me.id) return;

            const { stream } = await me.subscribe(publication.id);
            
            if (stream.contentType === 'data') {
                // チャットデータを受信した時
                stream.onData.add((data) => {
                    appendMessage(`相手: ${data}`);
                });
            } else {
                // 映像・音声を受信した時
                let newMedia;
                if (stream.contentType === 'video') {
                    newMedia = document.createElement('video');
                    newMedia.playsInline = true;
                    newMedia.autoplay = true;
                    newMedia.width = 300;
                } else {
                    newMedia = document.createElement('audio');
                    newMedia.autoplay = true;
                }
                stream.attach(newMedia);
                remoteMediaArea.appendChild(newMedia);
            }
        };

        // イベントリスナーの登録
        room.onPublicationSubscribed.add(({ publication }) => subscribeAndAttach(publication));
        room.publications.forEach(subscribeAndAttach);

        // UIの切り替え
        buttonJoin.innerText = "入室中";
        buttonJoin.disabled = true;
        buttonLeave.disabled = false;

    } catch (error) {
        console.error("エラー:", error);
        alert("接続失敗: " + error.message);
    }
};

// --- メッセージ送信処理 ---
sendButton.onclick = () => {
    const message = chatInput.value;
    if (message === "" || !dataStream) return;

    dataStream.write(message); // 相手に送信
    appendMessage(`自分: ${message}`); // 自分の画面に表示
    chatInput.value = "";
};

// --- 退出処理 ---
buttonLeave.onclick = async () => {
    if (!room || !me) return;

    try {
        await me.leave();
        await room.dispose();

        remoteMediaArea.innerHTML = '';
        chatMessages.innerHTML = ''; // チャット履歴もクリア

        if (localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach(track => track.stop());
            localVideo.srcObject = null;
        }

        buttonJoin.innerText = "入室する";
        buttonJoin.disabled = false;
        buttonLeave.disabled = true;

        console.log("正常に退出しました");
    } catch (error) {
        console.error("退出エラー:", error);
    }
};

// メッセージ表示用補助関数
function appendMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.innerText = text;
    messageElement.style.borderBottom = "1px solid #eee";
    messageElement.style.padding = "2px 0";
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // 常に最新メッセージへ
}
