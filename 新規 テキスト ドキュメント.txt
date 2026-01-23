import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@latest/dist/index.js';

// --- 設定 ---
const BACKEND_URL = "https://skyway-token-backend.onrender.com";
const ROOM_NAME = "p2p-room";

// --- HTML要素の取得 ---
const startBtn = document.getElementById('start-btn');
const statusDiv = document.getElementById('status');
const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');

startBtn.onclick = async () => {
    try {
        startBtn.disabled = true;
        statusDiv.innerText = "トークンを取得中... (Renderの起動に時間がかかる場合があります)";

        // 1. Render のバックエンドからトークンを取得
        const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${ROOM_NAME}`);
        if (!response.ok) throw new Error("トークン取得に失敗しました。URLを確認してください。");
        const { token } = await response.json();

        statusDiv.innerText = "SkyWay に接続中...";

        // 2. SkyWay Context の作成 (TURNサーバー設定などはトークンに含まれています)
        const context = await SkyWayContext.Create(token);

        // 3. P2Pルームへの参加
        const room = await SkyWayRoom.FindOrCreate(context, {
            type: 'p2p',
            name: ROOM_NAME,
        });
        const me = await room.join();

        statusDiv.innerText = "カメラを起動中...";

        // 4. 自分の映像・音声を取得して公開
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        
        await me.publish(audio);
        await me.publish(video);

        statusDiv.innerText = `通話中: ルーム名 ${ROOM_NAME}`;

        // 5. 相手の映像を購読（Subscribe）する処理
        const subscribeAndAttach = async (publication) => {
            if (publication.publisher.id === me.id) return; // 自分は無視

            const { stream } = await me.subscribe(publication.id);
            
            if (stream.contentType === 'video') {
                const wrapper = document.createElement('div');
                wrapper.className = 'video-wrapper';
                wrapper.id = `wrapper-${publication.publisher.id}`;

                const newVideo = document.createElement('video');
                newVideo.autoplay = true;
                newVideo.playsInline = true;
                stream.attach(newVideo);

                const label = document.createElement('div');
                label.className = 'label';
                label.innerText = `相手 (${publication.publisher.id.substring(0, 5)})`;

                wrapper.appendChild(newVideo);
                wrapper.appendChild(label);
                videoGrid.appendChild(wrapper);
            }
        };

        // 既存の参加者の映像をチェック
        room.publications.forEach(subscribeAndAttach);

        // 新しく映像が公開されたら購読
        room.onStreamPublished.add((e) => subscribeAndAttach(e.publication));

        // 相手が退出したら映像枠を消す
        room.onMemberLeft.add((e) => {
            const remoteWrapper = document.getElementById(`wrapper-${e.member.id}`);
            if (remoteWrapper) remoteWrapper.remove();
        });

    } catch (error) {
        console.error("Error:", error);
        statusDiv.innerText = `エラー: ${error.message}`;
        startBtn.disabled = false;
    }
};
