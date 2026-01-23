// index.js の中身をこのように書き換えます
(async () => {
    // CDNからモジュールをインポート
    const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = await import('https://cdn.jsdelivr.net/npm/@skyway-sdk/room@latest/+esm');

    const BACKEND_URL = "https://skyway-token-backend.onrender.com";
    const ROOM_NAME = "p2p-room";

    const startBtn = document.getElementById('start-btn');
    const statusDiv = document.getElementById('status');
    const localVideo = document.getElementById('local-video');
    const videoGrid = document.getElementById('video-grid');

    startBtn.onclick = async () => {
        try {
            startBtn.disabled = true;
            statusDiv.innerText = "接続を開始します...";

            // トークン取得
            const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${ROOM_NAME}`);
            const { token } = await response.json();

            // SkyWay接続
            const context = await SkyWayContext.Create(token);
            const room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: ROOM_NAME,
            });
            const me = await room.join();

            // カメラ起動
            const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
            video.attach(localVideo);
            await me.publish(audio);
            await me.publish(video);

            statusDiv.innerText = "通話中";

            // 相手の映像受信設定 (前回のロジックと同じ)
            const subscribe = async (pub) => {
                if (pub.publisher.id === me.id) return;
                const { stream } = await me.subscribe(pub.id);
                if (stream.contentType === 'video') {
                    const newVideo = document.createElement('video');
                    newVideo.autoplay = true;
                    newVideo.playsInline = true;
                    stream.attach(newVideo);
                    videoGrid.appendChild(newVideo);
                }
            };
            room.publications.forEach(subscribe);
            room.onStreamPublished.add((e) => subscribe(e.publication));

        } catch (e) {
            console.error(e);
            statusDiv.innerText = "エラー発生: " + e.message;
            startBtn.disabled = false;
        }
    };
})();
