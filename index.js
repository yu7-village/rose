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


    const statusLamp = document.getElementById('status-lamp');
    const serverText = document.getElementById('server-text');


   // --- バックエンドの起動確認（ヘルスチェック） ---
    async function checkBackend() {
        try {
            // トークン取得エンドポイントを叩いてみる（または専用の /health などがあればそれを使用）
            const res = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=health-check`);
            if (res.ok) {
                statusLamp.className = 'status-lamp status-online';
                serverText.innerText = "サーバー接続完了（起動中）";
            } else {
                throw new Error();
            }
        } catch (e) {
            statusLamp.className = 'status-lamp status-offline';
            serverText.innerText = "サーバーがオフラインまたは起動中...";
            // 3秒ごとに再試行（Renderが起きるまで追いかける）
            setTimeout(checkBackend, 3000);
        }
    }

    // ページ読み込み時に実行
    checkBackend();







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




// --- 参加者表示を更新する関数 ---
function updateMemberList(room) {
    const memberCount = document.getElementById('member-count');
    const memberIdsDiv = document.getElementById('member-ids');
    const container = document.getElementById('member-list-container');

    container.style.display = 'block';
    
    // 現在のメンバー一覧を取得
    const members = room.members;
    memberCount.innerText = members.length;

    // メンバーIDのリストを作成（先頭5文字を表示）
    memberIdsDiv.innerText = members.map(m => `ID: ${m.id.substring(0, 5)}${m.id === me.id ? ' (自分)' : ''}`).join(', ');
}

// --- startBtn.onclick の中、me = await room.join(); の後に追加 ---
me = await room.join();
updateMemberList(room); // 初回表示

// 誰かが新しく入ってきたら更新
room.onMemberJoined.add(() => updateMemberList(room));

// 誰かがいなくなったら更新
room.onMemberLeft.add((e) => {
    updateMemberList(room);
    const v = document.getElementById(`video-${e.member.id}`);
    if (v) v.remove();
});




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
