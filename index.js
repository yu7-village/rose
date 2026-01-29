(async () => {
    const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = await import('https://cdn.jsdelivr.net/npm/@skyway-sdk/room@latest/+esm');

    const BACKEND_URL = "https://skyway-token-backend.onrender.com";

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

    // 強制的にエラーを表示・通知する関数
    function notifyError(msg) {
        if (isAlerted) return; // 二重アラート防止
        isAlerted = true;
        
        console.error("Critical Application Error:", msg);
        if (statusDiv) {
            statusDiv.style.color = "#dc3545";
            statusDiv.innerText = `エラー: ${msg}`;
        }
        alert("【接続エラー】\n" + msg + "\n\nページを再読み込みしてください。");
        
        // 通信が死んでいるので、ボタン類をリセット
        startBtn.style.display = 'inline-block';
        roomNameInput.style.display = 'inline-block';
        leaveBtn.style.display = 'none';
    }

    async function checkBackend() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=health-check`);
            if (res.ok) {
                statusLamp.className = 'status-lamp status-online';
                serverText.innerText = "サーバー接続完了（起動中）";
            } else { throw new Error(); }
        } catch (e) {
            statusLamp.className = 'status-lamp status-offline';
            serverText.innerText = "サーバーがオフラインまたは起動中...";
            setTimeout(checkBackend, 3000);
        }
    }
    checkBackend();

    function updateMemberList(room) {
        const memberCount = document.getElementById('member-count');
        const memberIdsDiv = document.getElementById('member-ids');
        const container = document.getElementById('member-list-container');
        if (!me) return;
        container.style.display = 'block';
        const members = room.members;
        memberCount.innerText = members.length;
        memberIdsDiv.innerText = members.map(m => `ID: ${m.id.substring(0, 5)}${m.id === me.id ? ' (自分)' : ''}`).join(', ');
    }

    startBtn.onclick = async () => {
        const roomName = roomNameInput.value.trim() || "p2p-room";
        isAlerted = false;

        try {
            statusDiv.style.color = "#888";
            statusDiv.innerText = `ルーム「${roomName}」に接続中...`;

            const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomName}`);
            const { token } = await response.json();

            // 1. Context作成
            const context = await SkyWayContext.Create(token);
            
            // --- 接続状態監視の強化 ---
            if (context.onConnectionStateChanged) {
                context.onConnectionStateChanged.add((state) => {
                    console.log("SDK Connection State:", state);
                    if (state === "Disconnected") {
                        statusDiv.style.color = "#ffc107";
                        statusDiv.innerText = "接続中断：再試行中...";
                        
                        // ログに出ていた「WebSocket失敗」時の沈黙を防ぐため、
                        // Disconnectedになったら5秒だけ待って強制的にエラーにする
                        if (!reconnectionTimer) {
                            reconnectionTimer = setTimeout(() => {
                                notifyError("サーバーとの接続が完全に失われました（トークン期限切れの可能性があります）。");
                            }, 5000); // 猶予を5秒に短縮
                        }
                    } else if (state === "Connected") {
                        if (reconnectionTimer) {
                            clearTimeout(reconnectionTimer);
                            reconnectionTimer = null;
                        }
                        statusDiv.style.color = "#888";
                        statusDiv.innerText = "通話中 Room名 : " + roomName;
                    }
                });
            }

            // 致命的なエラーは即座に通知
            context.onFatalError.add((err) => notifyError("致命的な通信エラーが発生しました。"));

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
            updateMemberList(room);

            // ストリーム公開設定
            const dataStream = await SkyWayStreamFactory.createDataStream();
            dataPublish = await me.publish(dataStream);

            const subscribe = async (pub) => {
                if (pub.publisher.id === me.id) return;
                try {
                    const { stream } = await me.subscribe(pub.id);
                    if (pub.contentType === 'video') {
                        const newVideo = document.createElement('video');
                        newVideo.id = `video-${pub.publisher.id}`; 
                        newVideo.autoplay = true;
                        newVideo.playsInline = true;
                        stream.attach(newVideo);
                        videoGrid.appendChild(newVideo);
                    } else if (pub.contentType === 'data') {
                        stream.onData.add((data) => {
                            const msg = document.createElement('div');
                            msg.innerHTML = `<strong>相手:</strong> ${data}`;
                            chatMessages.appendChild(msg);
                        });
                    }
                } catch(e) { console.error("Subscribe error:", e); }
            };

            room.publications.forEach(subscribe);
            room.onStreamPublished.add((e) => subscribe(e.publication));
            room.onMemberLeft.add((e) => {
                updateMemberList(room);
                const v = document.getElementById(`video-${e.member.id}`);
                if (v) v.remove();
            });

            const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
            video.attach(localVideo);
            audioPublish = await me.publish(audio); 
            videoPublish = await me.publish(video);

            statusDiv.innerText = "通話中 Room名 : " + roomName;

        } catch (e) {
            notifyError("接続に失敗しました: " + e.message);
        }
    };

    leaveBtn.onclick = async () => {
        try {
            if (me) await me.leave();
        } catch (e) {
            console.warn("Leave error (already disconnected):", e);
        }
        location.reload();
    };

    // その他ボタン(video/audio/send)の処理は前回と同様
    videoBtn.onclick = async () => { /* ...省略(変更なし)... */ };
    audioBtn.onclick = async () => { /* ...省略(変更なし)... */ };
    sendBtn.onclick = () => { /* ...省略(変更なし)... */ };
})();
