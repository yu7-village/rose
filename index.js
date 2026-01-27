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
    
    // チャット要素
    const chatContainer = document.getElementById('chat-container');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    let me; 
    let videoPublish; 
    let audioPublish; 
    let dataPublish;

    // --- メッセージを表示する補助関数 ---
    function appendMessage(sender, text) {
        const msg = document.createElement('div');
        msg.style.marginBottom = "5px";
        msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // --- バックエンド起動確認 ---
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

    // --- 参加者表示を更新する関数 ---
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

    // --- 通話開始ボタンの処理 ---
    startBtn.onclick = async () => {
        const roomName = roomNameInput.value.trim() || "p2p-room";

        try {
            startBtn.style.display = 'none';
            roomNameInput.style.display = 'none';
            leaveBtn.style.display = 'inline-block';
            videoBtn.style.display = 'inline-block';
            audioBtn.style.display = 'inline-block';
            statusDiv.innerText = `ルーム「${roomName}」に接続中...`;

            // トークンの取得
            const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomName}`);
            const { token } = await response.json();

            // SkyWayの初期化
            const context = await SkyWayContext.Create(token);

            // --- 接続状態の監視設定 ---
            context.onFatalError.add((error) => {
                console.error("Fatal Error:", error);
                statusDiv.style.color = "#dc3545";
                statusDiv.innerText = "エラー: 接続が切断されました。再読み込みしてください。";
                alert("通信の有効期限が切れたか、致命的なエラーが発生しました。");
            });

            context.onTokenExpiresSoon.add(() => {
                statusDiv.style.color = "#ffc107";
                statusDiv.innerText = "警告: まもなく接続期限が切れます。";
            });

            // ルームへの参加
            const room = await SkyWayRoom.FindOrCreate(context, {
                type: 'p2p',
                name: roomName,
            });
            
            me = await room.join();

            // UIの表示
            chatContainer.style.display = 'block';
            updateMemberList(room);

            // データ送信用ストリーム
            const dataStream = await SkyWayStreamFactory.createDataStream();
            dataPublish = await me.publish(dataStream);

            sendBtn.onclick = () => {
                const text = chatInput.value;
                if (!text) return;
                dataStream.write(text);
                appendMessage("自分", text);
                chatInput.value = "";
            };

            // ストリーム受信処理
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
                        appendMessage(`相手(${pub.publisher.id.substring(0,5)})`, data);
                    });
                }
            };

            room.publications.forEach(subscribe);
            room.onStreamPublished.add((e) => subscribe(e.publication));
            
            room.onMemberJoined.add(() => updateMemberList(room));
            room.onMemberLeft.add((e) => {
                updateMemberList(room);
                const v = document.getElementById(`video-${e.member.id}`);
                if (v) v.remove();
            });

            // 映像・音声の公開
            const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
            video.attach(localVideo);
            audioPublish = await me.publish(audio); 
            videoPublish = await me.publish(video);

            statusDiv.style.color = "#888";
            statusDiv.innerText = "通話中 Room名 : " + roomName;

        } catch (e) {
            console.error(e);
            statusDiv.innerText = "エラー: " + e.message;
            startBtn.style.display = 'inline-block';
            roomNameInput.style.display = 'inline-block';
        }
    };

    // --- カメラON/OFFボタン ---
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

    // --- マイクON/OFFボタン ---
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

    // --- 退出ボタン ---
    leaveBtn.onclick = async () => {
        if (me) await me.leave();
        location.reload();
    };
})();
