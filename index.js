(async () => {
    const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = await import('https://cdn.jsdelivr.net/npm/@skyway-sdk/room@latest/+esm');

    const BACKEND_URL = "https://skyway-token-backend.onrender.com";
    const ROOM_NAME = "p2p-room";

    const startBtn = document.getElementById('start-btn');
    const leaveBtn = document.getElementById('leave-btn');
    const videoBtn = document.getElementById('toggle-video-btn'); // HTMLに追加が必要
    const audioBtn = document.getElementById('toggle-audio-btn'); // HTMLに追加が必要
    const statusDiv = document.getElementById('status');
    const localVideo = document.getElementById('local-video');
    const videoGrid = document.getElementById('video-grid');

    let me; 
    let videoPublish; // 映像の公開状態を管理
    let audioPublish; // 音声の公開状態を管理

    startBtn.onclick = async () => {
        try {
            startBtn.style.display = 'none';
            leaveBtn.style.display = 'inline-block';
            videoBtn.style.display = 'inline-block';
            audioBtn.style.display = 'inline-block';
            statusDiv.innerText = "接続中...";

            const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${ROOM_NAME}`);
            const { token } = await response.json();

            const context = await SkyWayContext.Create(token);
            const room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: ROOM_NAME,
            });
            
            me = await room.join();

            const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
            video.attach(localVideo);
            
            // 公開情報を変数に保存
            audioPublish = await me.publish(audio); 
            videoPublish = await me.publish(video);

            statusDiv.innerText = "通話中";

            // 相手の受信処理
            const subscribe = async (pub) => {
                if (pub.publisher.id === me.id) return;
                const { stream } = await me.subscribe(pub.id);
                if (stream.contentType === 'video') {
                    const newVideo = document.createElement('video');
                    newVideo.id = `video-${pub.publisher.id}`; 
                    newVideo.autoplay = true;
                    newVideo.playsInline = true;
                    stream.attach(newVideo);
                    videoGrid.appendChild(newVideo);
                }
            };

            room.publications.forEach(subscribe);
            room.onStreamPublished.add((e) => subscribe(e.publication));
            
            room.onMemberLeft.add((e) => {
                const v = document.getElementById(`video-${e.member.id}`);
                if (v) v.remove();
            });

        } catch (e) {
            console.error(e);
            statusDiv.innerText = "エラー: " + e.message;
            startBtn.style.display = 'inline-block';
        }
    };




    // --- カメラON/OFFボタンの処理 ---
videoBtn.onclick = async () => {
    if (!videoPublish) return;
    if (videoPublish.state === 'enabled') {
        await videoPublish.disable(); // 通信を停止
        videoBtn.innerText = "カメラOFF";
        videoBtn.style.background = "#6c757d"; // OFF時はグレー
    } else {
        await videoPublish.enable(); // 通信を再開
        videoBtn.innerText = "カメラON";
        videoBtn.style.background = "#28a745"; // ON時は緑
    }
};

// --- マイクON/OFFボタンの処理 ---
audioBtn.onclick = async () => {
    if (!audioPublish) return;
    if (audioPublish.state === 'enabled') {
        await audioPublish.disable(); // ミュート
        audioBtn.innerText = "マイクOFF";
        audioBtn.style.background = "#6c757d"; // OFF時はグレー
    } else {
        await audioPublish.enable(); // 解除
        audioBtn.innerText = "マイクON";
        audioBtn.style.background = "#28a745"; // ON時は緑
    }
};





    leaveBtn.onclick = async () => {
        if (!me) return;
        try {
            await me.leave();
            location.reload();
        } catch (e) {
            location.reload();
        }
    };
})();
