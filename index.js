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
    const memberCount = document.getElementById('member-count');
    const memberIdsDiv = document.getElementById('member-ids');
    const memberContainer = document.getElementById('member-list-container');

    let me; 
    let videoPublish; 
    let audioPublish; 
    let dataPublish; 
    let dataStream; 
    let isAlerted = false; 

    function notifyError(msg) {
        if (isAlerted) return;
        isAlerted = true;
        if (statusDiv) {
            statusDiv.style.color = "#dc3545";
            statusDiv.innerText = `終了: ${msg}`;
        }
        alert("【通知】\n" + msg + "\n\nページを再読み込みしてください。");
        location.reload();
    }

    function appendMessage(sender, text) {
        const msg = document.createElement('div');
        msg.style.marginBottom = "5px";
        msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function updateMemberList(room) {
        if (!me || !memberContainer) return;
        memberContainer.style.display = 'block';
        const members = room.members;
        if (memberCount) memberCount.innerText = members.length;
        if (memberIdsDiv) {
            memberIdsDiv.innerText = members.map(m => 
                `ID: ${m.id.substring(0, 5)}${m.id === me.id ? ' (自分)' : ''}`
            ).join(', ');
        }
    }

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

            // --- 【確実な判定】トークン有効期限の解析とカウントダウン ---
            try {
                const payloadBase64 = token.split('.')[1];
                const payload = JSON.parse(atob(payloadBase64));
                const expireTimeInMs = payload.exp * 1000;
                const remainingTimeMs = expireTimeInMs - Date.now();

                console.log(`制限時間まであと: ${Math.floor(remainingTimeMs / 1000)}秒`);

                if (remainingTimeMs > 0) {
                    setTimeout(() => {
                        notifyError("通話の制限時間（設定時間）が終了しました。");
                    }, remainingTimeMs);
                } else {
                    throw new Error("取得したトークンが既に期限切れです。");
                }
            } catch (tokenErr) {
                console.error("Token Analysis Error:", tokenErr);
            }

            const context = await SkyWayContext.Create(token);
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

            // チャット用
            dataStream = await SkyWayStreamFactory.createDataStream();
            dataPublish = await me.publish(dataStream);
            sendBtn.onclick = () => {
                const text = chatInput.value;
                if (!text || !dataStream) return;
                dataStream.write(text);
                appendMessage("自分", text);
                chatInput.value = "";
            };

            // メディア用
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
                } else if (pub.contentType === 'data') {
                    stream.onData.add((data) => {
                        appendMessage(`相手`, data);
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

            statusDiv.innerText = "通話中: " + roomName;

        } catch (e) {
            console.error(e);
            notifyError("接続に失敗しました。");
        }
    };

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

    leaveBtn.onclick = async () => {
        try { if (me) await me.leave(); } catch (e) {}
        location.reload();
    };
})();
