(async () => {
    const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = await import('https://cdn.jsdelivr.net/npm/@skyway-sdk/room@latest/+esm');

    const BACKEND_URL = "https://skyway-token-backend.onrender.com";
    const ROOM_NAME = "p2p-room";

    const startBtn = document.getElementById('start-btn');
    const leaveBtn = document.getElementById('leave-btn'); // 追加
    const statusDiv = document.getElementById('status');
    const localVideo = document.getElementById('local-video');
    const videoGrid = document.getElementById('video-grid');

    let me; // 退室時にも使うため、外で定義します

    startBtn.onclick = async () => {
        try {
            startBtn.style.display = 'none'; // 開始ボタンを隠す
            leaveBtn.style.display = 'inline-block'; // 終了ボタンを出す
            statusDiv.innerText = "接続中...";

            const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${ROOM_NAME}`);
            const { token } = await response.json();

            const context = await SkyWayContext.Create(token);
            const room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: ROOM_NAME,
            });
            
            me = await room.join(); // 変数 me に格納

            const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
            video.attach(localVideo);
            await me.publish(audio);
            await me.publish(video);

            statusDiv.innerText = "通話中";

            const subscribe = async (pub) => {
                if (pub.publisher.id === me.id) return;
                const { stream } = await me.subscribe(pub.id);
                if (stream.contentType === 'video') {
                    const newVideo = document.createElement('video');
                    newVideo.id = `video-${pub.publisher.id}`; // 削除用にIDを付与
                    newVideo.autoplay = true;
                    newVideo.playsInline = true;
                    stream.attach(newVideo);
                    videoGrid.appendChild(newVideo);
                }
            };

            room.publications.forEach(subscribe);
            room.onStreamPublished.add((e) => subscribe(e.publication));
            
            // 相手が退出した時に映像を消す処理
            room.onMemberLeft.add((e) => {
                const v = document.getElementById(`video-${e.member.id}`);
                if (v) v.remove();
            });

        } catch (e) {
            console.error(e);
            statusDiv.innerText = "エラー: " + e.message;
            startBtn.style.display = 'inline-block';
            leaveBtn.style.display = 'none';
        }
    };

    // --- 退室ボタンが押された時の処理 ---
    leaveBtn.onclick = async () => {
        if (!me) return;

        statusDiv.innerText = "退室中...";
        
        try {
            // SkyWayのルームから退室
            await me.leave();
            // 画面をリロードして全ての状態をリセット
            location.reload(); 
        } catch (e) {
            console.error(e);
            location.reload(); // エラーが起きてもリロードして強制終了
        }
    };
})();
