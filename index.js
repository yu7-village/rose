(async () => {
    const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = await import('https://cdn.jsdelivr.net/npm/@skyway-sdk/room@latest/+esm');

    const BACKEND_URL = "https://skyway-token-backend.onrender.com";

    // --- HTML要素の取得 ---
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

    // --- グローバル変数 ---
    let me; 
    let videoPublish; 
    let audioPublish; 
    let dataPublish; 
    let dataStream; 
    let isAlerted = false; 
    let reconnectionTimer = null;

    // --- 補助関数 ---
    function notifyError(msg) {
        if (isAlerted) return;
        isAlerted = true;
        if (statusDiv) {
            statusDiv.style.color = "#dc3545";
            statusDiv.innerText = `エラー: ${msg}`;
        }
        alert("【接続エラー】\n" + msg + "\n\nページを再読み込みしてください。");
    }

    function appendMessage(sender, text) {
        const msg = document.createElement('div');
        msg.style.marginBottom = "5px";
        msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // --- サーバー起動確認 ---
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

    // --- メイン処理：通話開始 ---
    startBtn.onclick = async () => {
        const roomName = roomNameInput.value.trim() || "p2p-room";
        isAlerted = false;

        try {
            statusDiv.innerText = "接続中...";

            // 1. トークン取得
            const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomName}`);
            const { token } = await response.json();

            // 2. Context作成
            const context = await SkyWayContext.Create(token);
            
            // 接続監視ロジック (10秒ルール)
            if (context.onConnectionStateChanged && typeof context.onConnectionStateChanged.add === 'function') {
                context.onConnectionStateChanged.add((state) => {
                    if (state === "Disconnected") {
                        statusDiv.style.color = "#ffc107";
                        statusDiv.innerText = "再接続を試行中...";
                        if (!reconnectionTimer) {
                            reconnectionTimer = setTimeout(() => notifyError("接続が切れました。"), 10000);
                        }
                    } else if (state === "Connected" && reconnectionTimer) {
                        clearTimeout(reconnectionTimer);
                        reconnectionTimer = null;
                        statusDiv.style.color = "#888";
                        statusDiv.innerText = "通話中: " + roomName;
                    }
                });
            }

            // 3. Room入室
            const room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: roomName });
            me = await room.join();

            // UI表示切り替え
            startBtn.style.display = 'none';
            roomNameInput.style.display = 'none';
            leaveBtn.style.display = 'inline-block';
            videoBtn.style.display = 'inline-block';
            audioBtn.style.display = 'inline-block';
            chatContainer.style.display = 'block';

            // 4. チャット用データストリームの公開
            dataStream = await SkyWayStreamFactory.createDataStream();
            dataPublish = await me.publish(dataStream);

            // 送信ボタンのロジック
            sendBtn.onclick = () => {
                const text = chatInput.value;
                if (!text || !dataStream) return;
                dataStream.write(text);
                appendMessage("自分", text);
                chatInput.value = "";
            };

            // 5. ビデオ・マイクストリームの公開
            const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
            video.attach(localVideo);
            audioPublish = await me.publish(audio); 
            videoPublish = await me.publish(video);

            // 6. 受信処理 (ビデオおよびチャット)
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
                } else if (pub.contentType === 'data') {
                    stream.onData.add((data) => {
                        appendMessage(`相手`, data);
                    });
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

    // --- カメラ・マイク ON/OFF 操作 ---
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

    // --- 終了処理 ---
    leaveBtn.onclick = async () => {
        try { if (me) await me.leave(); } catch (e) {}
        location.reload();
    };
})();
