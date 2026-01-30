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
    // タイマー表示用要素
    const timerDiv = document.getElementById('room-timer');

    let me; 
    let videoPublish; 
    let audioPublish; 
    let dataPublish; 
    let dataStream; 
    let isAlerted = false; 

    // --- 補助関数 ---
    function notifyError(msg) {
        if (isAlerted) return;
        isAlerted = true;
        if (statusDiv) {
            statusDiv.style.color = "#dc3545";
            statusDiv.innerText = `終了: ${msg}`;
        }
        alert("【お知らせ】\n" + msg);
        location.reload();
    }

    // カウントダウン処理
    function startRoomTimer(expireTimeMs) {
        if (!timerDiv) return;
        const timerInterval = setInterval(() => {
            const now = Date.now();
            const diff = expireTimeMs - now;

            if (diff <= 0) {
                clearInterval(timerInterval);
                timerDiv.innerText = "終了時刻になりました";
                notifyError("制限時間が切れました。お手数ですが、再度ルームに入り直してください。");
                return;
            }

            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            timerDiv.innerText = `ルーム終了まで: ${minutes}分${seconds}秒`;
        }, 1000);
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

    // --- メイン処理 ---
    startBtn.onclick = async () => {
        const roomName = roomNameInput.value.trim() || "p2p-room";
        isAlerted = false;

        try {
            statusDiv.innerText = "接続中...";

            const response = await fetch(`${BACKEND_URL}/api/skyway-token?roomId=${roomName}`);
            const { token } = await response.json();

            const context = await SkyWayContext.Create(token);
            const room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: roomName });
            me = await room.join();

            // --- ルーム終了時刻の同期ロジック ---
            let roomExpireTime;
            if (room.members.length === 1) {
                // 自分が最初の1人目の場合：トークンから終了時刻を抽出してルームに保存
                const payload = JSON.parse(atob(token.split('.')[1]));
                roomExpireTime = payload.exp * 1000; //
                await room.updateMetadata(roomExpireTime.toString()); // ルームデータに保存
            } else {
                // 2人目以降：ルームに保存されている終了時刻を読み取る
                roomExpireTime = parseInt(room.metadata) || (JSON.parse(atob(token.split('.')[1])).exp * 1000);
            }

            if (roomExpireTime) {
                startRoomTimer(roomExpireTime); // 全員同じ時刻でカウントダウン開始
            }

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

    // カメラ・マイク操作
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
