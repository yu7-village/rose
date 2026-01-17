// script.js - エラー修正・退出機能付き全文
import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button');
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');

let room;
let me;

// --- 入室処理 ---
buttonJoin.onclick = async () => {
    if (roomNameInput.value === "") return;

    try {
        const response = await fetch(`https://skyway-token-backend.onrender.com/api/skyway-token?roomId=${roomNameInput.value}`);
        const data = await response.json();
        const { token } = data;

        console.log("トークン取得成功");

        const context = await SkyWayContext.Create(token);

        room = await SkyWayRoom.FindOrCreate(context, {
            type: 'p2p',
            name: roomNameInput.value,
        });

        me = await room.join();
        console.log("入室完了:", me.id);

        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);

        // --- 相手の映像を購読する関数 ---
        const subscribeAndAttach = async (publication) => {
            // ★修正ポイント: publication自体が正しく渡されているかチェック
            if (!publication || publication.publisher.id === me.id) return;

            const { stream } = await me.subscribe(publication.id);
            
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
        };

        // ★修正ポイント: 引数の受け取り方を { publication } という形に明示する
        room.onPublicationSubscribed.add(({ publication }) => {
            subscribeAndAttach(publication);
        });

        // 既にある映像を購読
        room.publications.forEach(subscribeAndAttach);

        buttonJoin.innerText = "入室中";
        buttonJoin.disabled = true;
        buttonLeave.disabled = false;

    } catch (error) {
        console.error("エラーが発生しました:", error);
        alert("接続失敗: " + error.message);
    }
};

// --- 退出処理 ---
buttonLeave.onclick = async () => {
    if (!room || !me) return;

    try {
        await me.leave();
        await room.dispose();

        remoteMediaArea.innerHTML = '';

        if (localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach(track => track.stop());
            localVideo.srcObject = null;
        }

        buttonJoin.innerText = "入室する";
        buttonJoin.disabled = false;
        buttonLeave.disabled = true;

        console.log("正常に退出しました");
    } catch (error) {
        console.error("退出時にエラーが発生しました:", error);
    }
};
