// 🚨 1行目をこのように修正します（末尾の +esm が重要です）
import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button'); // 追加
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');

let room; // ルームへの参照を保持
let me;   // 自分自身の参照を保持



buttonJoin.onclick = async () => {
    if (!roomNameInput.value) return;

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

        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);

        const subscribeAndAttach = async (publication) => {
            if (publication.publisher.id === me.id) return;
            const { stream } = await me.subscribe(publication.id);
            let newMedia = document.createElement(stream.contentType === 'video' ? 'video' : 'audio');
            newMedia.playsInline = true;
            newMedia.autoplay = true;
            if (stream.contentType === 'video') newMedia.width = 300;
            stream.attach(newMedia);
            remoteMediaArea.appendChild(newMedia);
        };

        room.onPublicationSubscribed.add(({ publication }) => subscribeAndAttach(publication));
        room.publications.forEach(subscribeAndAttach);

        // ボタンの状態切り替え
        buttonJoin.disabled = true;
        buttonLeave.disabled = false;
        buttonJoin.innerText = "入室中";

    } catch (error) {
        console.error(error);
        alert("接続失敗");
    }
};

// --- 🚨 退出処理の追加 ---
buttonLeave.onclick = async () => {
    if (!room) return;

    // 1. ルームを去る（これで相手側から自分の映像が消えます）
    await me.leave();
    await room.dispose(); // ルームのリソースを解放

    // 2. 相手の映像表示エリアを空にする
    remoteMediaArea.innerHTML = '';

    // 3. 自分のビデオを停止して黒画面にする（必要に応じて）
    localVideo.srcObject = null;

    // 4. ボタンの状態を元に戻す
    buttonJoin.disabled = false;
    buttonLeave.disabled = true;
    buttonJoin.innerText = "入室する";
    
    console.log("退出しました");
};




        // 5. 自分のカメラとマイクを取得して公開（Publish）
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);

        // 6. 相手のストリームが流れてきた時の処理（Subscribe）
        const subscribeAndAttach = async (publication) => {
            if (publication.publisher.id === me.id) return;

            const { stream } = await me.subscribe(publication.id);
            let newMedia;
            if (stream.contentType === 'video') {
                newMedia = document.createElement('video');
                newMedia.playsInline = true;
                newMedia.autoplay = true;
                newMedia.width = 300;
            } else {
                newMedia = document.createElement('audio');
                newMedia.controls = true;
                newMedia.autoplay = true;
            }
            stream.attach(newMedia);
            remoteMediaArea.appendChild(newMedia);
        };

        room.onPublicationSubscribed.add(({ publication }) => subscribeAndAttach(publication));
        room.publications.forEach(subscribeAndAttach);

        buttonJoin.innerText = "入室中";
        buttonJoin.disabled = true;

    } catch (error) {
        console.error("エラーが発生しました:", error);
        alert("接続に失敗しました。詳細はコンソールを確認してください。");
    }
};
