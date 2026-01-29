(async () => {
    const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = await import('https://cdn.jsdelivr.net/npm/@skyway-sdk/room@latest/+esm');

    const BACKEND_URL = "https://skyway-token-backend.onrender.com";

    // 要素の取得
    const startBtn = document.getElementById('start-btn');
    const leaveBtn = document.getElementById('leave-btn');
    const videoBtn = document.getElementById('toggle-video-btn');
    const audioBtn = document.getElementById('toggle-audio-btn');
    const roomNameInput = document.getElementById('room-name-input');
    const statusDiv = document.getElementById('status');
    const localVideo = document.getElementById('local-video');
    const videoGrid = document.getElementById('video-grid');
    const statusLamp = document.getElementById('status-lamp');
    const serverText = document.getElementById('server-text');
    const chatContainer = document.getElementById('chat-container');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    let me; 
    let videoPublish; 
    let audioPublish; 
    let dataPublish;
    let isAlerted = false; 
    let reconnectionTimer = null;

    function notifyError(msg) {
        if (isAlerted) return;
        isAlerted = true;
        if (statusDiv) {
            statusDiv.style.color = "#dc3545";
            statusDiv.innerText = `エラー: ${msg}`;
        }
        alert("【接続エラー】\n" + msg);
    }

    // サーバーの死活監視
    async function checkBackend() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=health-check`);
            if (res.ok) {
                statusLamp.className = 'status-lamp status-online';
                serverText.innerText = "サーバー接続完了";
            }
        } catch (e) {
            statusLamp.className = 'status-lamp status-offline';
            serverText.innerText = "サーバー接続待ち...";
            setTimeout(checkBackend, 3000);
        }
    }
    checkBackend();

    startBtn.onclick = async () => {
        const roomName = roomNameInput.value.trim() || "p2p-room";
        isAlerted = false;

        try {
            statusDiv.innerText = "接続中...";

            const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomName}`);
            const { token } = await response.json();

            // 1. Context作成
            const context = await SkyWayContext.Create(token);
            
            // 【修正】最も安全なイベント登録
            if (context.onConnectionStateChanged && typeof context.onConnectionStateChanged.add === 'function') {
                context.onConnectionStateChanged.add((state) => {
                    if (state === "Disconnected") {
                        statusDiv.innerText = "再接続を試行中...";
                        if (!reconnectionTimer) {
                            reconnectionTimer = setTimeout(() => notifyError("接続が切れました。"), 5000);
                        }
                    } else if (state === "Connected" && reconnectionTimer) {
                        clearTimeout(reconnectionTimer);
                        reconnectionTimer = null;
                        statusDiv.innerText = "通話中: " + roomName;
                    }
                });
            }

            // 2. Room作成
            const room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: roomName });
            me = await room.join();

            // UI切り替え
            startBtn.style.display = 'none';
            roomNameInput.style.display = 'none';
            leaveBtn.style.display = 'inline-block';
            videoBtn.style.display = 'inline-block';
            audioBtn.style.display = 'inline-block';
            chatContainer.style.display = 'block';

            // ストリーム公開
            const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
            video.attach(localVideo);
            audioPublish = await me.publish(audio); 
            videoPublish = await me.publish(video);

            // 受信処理
            const subscribe = async (pub) => {
                if (pub.publisher.id === me.id) return;
                const { stream } = await me.subscribe(pub.id);
                if (pub.contentType === 'video') {
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

            statusDiv.innerText = "通話中: " + roomName;

        } catch (e) {
            console.error(e);
            notifyError("接続に失敗しました。");
        }
    };

    // カメラボタン
    videoBtn.onclick = async () => {
        if (!videoPublish) return;
        if (videoPublish.state === 'enabled') {
            await videoPublish.disable();
            videoBtn.innerText = "カメラOFF";
            videoBtn.style.background = "#6c757d";
        } else {
            await videoPublish.enable();
            videoBtn.innerText = "カメラON";
            videoBtn.style.background = "#28a745";
        }
    };

    // マイクボタン
    audioBtn.onclick = async () => {
        if (!audioPublish) return;
        if (audioPublish.state === 'enabled') {
            await audioPublish.disable();
            audioBtn.innerText = "マイクOFF";
            audioBtn.style.background = "#6c757d";
        } else {
            await audioPublish.enable();
            audioBtn.innerText = "マイクON";
            audioBtn.style.background = "#28a745";
        }
    };

    leaveBtn.onclick = async () => {
        try { if (me) await me.leave(); } catch (e) {}
        location.reload();
    };
})();
