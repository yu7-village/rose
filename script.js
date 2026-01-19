// script.js - インターミテント・エラー（add of undefined）対策版
import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

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
            // 自分の配信、またはすでに無効な配信は無視
            if (!publication || !publication.publisher || publication.publisher.id === me.id) return;

            try {
                const { stream } = await me.subscribe(publication.id);
                const mediaId = `media-${publication.id}`;

                if (stream.contentType === 'data') {
                    stream.onData.add((data) => {
                        appendMessage(`相手: ${data}`);
                    });
                } else {
                    let newMedia = document.createElement(stream.contentType === 'video' ? 'video' : 'audio');
                    newMedia.id = mediaId;
                    newMedia.playsInline = true;
                    newMedia.autoplay = true;
                    if (stream.contentType === 'video') newMedia.width = 300;
                    stream.attach(newMedia);
                    remoteMediaArea.appendChild(newMedia);
                }

                // ★ エラー対策: onUnpublished が存在するか確認してから登録
                if (publication.onUnpublished) {
                    publication.onUnpublished.add(() => {
                        const el = document.getElementById(mediaId);
                        if (el) el.remove();
                        console.log("ストリームが削除されました");
                    }, { once: true }); // 1回だけ実行するように指定
                }

            } catch (e) {
                console.warn("購読中にエラーが発生しましたが無視します:", e);
            }
        };

        // イベントリスナーの登録
        room.onStreamPublished.add(({ publication }) => subscribeAndAttach(publication));
        
        room.onMemberLeft.add(({ member }) => {
            appendMessage(`通知: 相手(${member.id.substring(0,5)})が退出しました`);
        });

        // 既存の配信を購読
        room.publications.forEach(subscribeAndAttach);

        // 自分の配信開始
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
        console.error("致命的なエラー:", error);
        alert("接続失敗: " + error.message);
    }
};

// --- メッセージ送信 ---
sendButton.onclick = () => {
    const message = chatInput.value;
    if (message === "" || !dataStream) return;
    try {
        dataStream.write(message); 
        appendMessage(`自分: ${message}`);
        chatInput.value = "";
    } catch (e) {
        console.error("送信エラー:", e);
    }
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
