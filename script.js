// script.js - チャット安定化対応版
import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

// UI要素の取得
const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button');
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');

let room;
let me;
let dataStream;

// --- 入室処理 ---
buttonJoin.onclick = async () => {
    if (roomNameInput.value === "") return;

    try {
        const response = await fetch(`https://skyway-token-backend.onrender.com/api/skyway-token?roomId=${roomNameInput.value}`);
        const data = await response.json();
        const { token } = data;

        const context = await SkyWayContext.Create(token);
        room = await SkyWayRoom.FindOrCreate(context, {
            type: 'p2p',
            name: roomNameInput.value,
        });

        me = await room.join();
        console.log("入室完了:", me.id);

        // --- 相手のストリームを購読する関数 ---
        const subscribeAndAttach = async (publication) => {
            if (!publication || publication.publisher.id === me.id) return;

            // すでに購読済みかチェックして重複を防ぐ
            const { stream } = await me.subscribe(publication.id);
            
            if (stream.contentType === 'data') {
                // チャットデータを受信
                stream.onData.add((data) => {
                    appendMessage(`相手: ${data}`);
                });
            } else {
                // 映像・音声を表示
                let newMedia = document.createElement(stream.contentType === 'video' ? 'video' : 'audio');
                newMedia.playsInline = true;
                newMedia.autoplay = true;
                if (stream.contentType === 'video') newMedia.width = 300;
                stream.attach(newMedia);
                remoteMediaArea.appendChild(newMedia);
            }
        };

        // ★重要：相手が後からストリーム（映像やチャット）を公開した時に実行
        room.onStreamPublished.add(({ publication }) => {
            subscribeAndAttach(publication);
        });

        // 既にあるストリームをすべて購読
        room.publications.forEach(subscribeAndAttach);

        // 自分の映像・音声を公開
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);

        // 自分のチャット用ストリームを公開
        dataStream = await SkyWayStreamFactory.createDataStream();
        await me.publish(dataStream);

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

    dataStream.write(message); 
    appendMessage(`自分: ${message}`);
    chatInput.value = "";
};

// --- 退出処理 ---
buttonLeave.onclick = async () => {
    if (!room || !me) return;
    try {
        await me.leave();
        await room.dispose();
        remoteMediaArea.innerHTML = '';
        chatMessages.innerHTML = '';
        if (localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach(track => track.stop());
            localVideo.srcObject = null;
        }
        buttonJoin.innerText = "入室する";
        buttonJoin.disabled = false;
        buttonLeave.disabled = true;
    } catch (error) {
        console.error("退出エラー:", error);
    }
};

function appendMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.innerText = text;
    messageElement.style.borderBottom = "1px solid #eee";
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
