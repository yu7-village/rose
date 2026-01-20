import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

const BACKEND_URL = "https://skyway-token-backend.onrender.com";

// UI要素の取得（id名はHTMLと一致させてください）
const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button');
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');
const chatMessages = document.getElementById('chat-messages');

let room, me, dataStream;

buttonJoin.onclick = async () => {
    if (!roomNameInput.value) return;

    try {
        // 1. トークン取得
        const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomNameInput.value}`);
        const data = await response.json();
        const token = data.token;

        // 2. コンテキスト作成 (ここで decode token エラーが出なくなります)
        const context = await SkyWayContext.Create(token);

        // 3. ルーム作成 (P2Pを指定)
        room = await SkyWayRoom.FindOrCreate(context, { 
            type: 'p2p', 
            name: roomNameInput.value 
        });

        me = await room.join();

        // 4. ストリームの受信設定
        const subscribeAndAttach = async (publication) => {
            if (publication.publisher.id === me.id) return;
            const { stream } = await me.subscribe(publication.id);
            
            if (stream.contentType === 'data') {
                stream.onData.add(d => {
                    const el = document.createElement('div');
                    el.innerText = `相手: ${d}`;
                    chatMessages.appendChild(el);
                });
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

        // 5. 自分のメディアを公開
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);
        
        dataStream = await SkyWayStreamFactory.createDataStream();
        await me.publish(dataStream);

        buttonJoin.disabled = true;
        buttonLeave.disabled = false;

    } catch (error) {
        console.error("詳細:", error);
        alert("接続失敗: " + error.message);
    }
};

buttonLeave.onclick = () => location.reload();
