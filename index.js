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
    let reconnectionTimer = null; // 再接続待ち用タイマー

    // エラー通知関数
    function notifyError(msg) {
        console.error("Critical Error:", msg);
        if (statusDiv) {
            statusDiv.style.color = "#dc3545";
            statusDiv.innerText = `エラー: ${msg} 再読み込みしてください。`;
        }
        if (!isAlerted) {
            alert(msg + "\nページを再読み込みして再接続してください。");
            isAlerted = true;
        }
    }

    function appendMessage(sender, text) {
        const msg = document.createElement('div');
        msg.style.marginBottom = "5px";
        msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
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
            
            // Context側の致命的エラー監視
            if (context.onFatalError) {
                context.onFatalError.add(() => notifyError("認証の有効期限が切れました。"));
            }

            // 【瞬断対策】接続状態の監視ロジック
            if (context.onConnectionStateChanged) {
                context.onConnectionStateChanged.add((state) => {
                    console.log("Connection State:", state);

                    if (state === "Disconnected") {
                        // 切断されたら「再接続中」表示にして10秒待つ
                        statusDiv.style.color = "#ffc107"; // オレンジ
                        statusDiv.innerText = "ネットワーク不安定：再接続を試みています...";
                        
                        if (!reconnectionTimer) {
                            reconnectionTimer = setTimeout(() => {
                                notifyError("再接続できませんでした。接続が完全に切断されました。");
                            }, 10000); // 10秒の猶予
                        }
                    } else if (state === "Connected") {
                        // 10秒以内に復旧したらタイマーを止めて正常表示に戻す
                        if (reconnectionTimer) {
                            clearTimeout(reconnectionTimer);
                            reconnectionTimer = null;
                            statusDiv.style.color = "#888";
                            statusDiv.innerText = "通話中 Room名 : " + roomName;
                            console.log("再接続に成功しました。");
                        }
                    }
                });
            }

            // 2. Room作成
            const room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: roomName });
            
            if (room.onFatalError) {
                room.onFatalError.add(() => notifyError("ルーム通信が完全に停止しました。"));
            }
            
            me = await room.join();

            // UI切り替え
            startBtn.style.display = 'none';
            roomNameInput.style.display = 'none';
            leaveBtn.style.display = 'inline-block';
            videoBtn.style.display = 'inline-block';
            audioBtn.style.display = 'inline-block';
            chatContainer.style.display = 'block';
            updateMemberList(room);

            const dataStream = await SkyWayStreamFactory.createDataStream();
            dataPublish = await me.publish(dataStream);

            sendBtn.onclick = () => {
                const text = chatInput.value;
                if (!text) return;
                dataStream.write(text);
                appendMessage("自分", text);
                chatInput.value = "";
            };

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
                    stream.onData.add((data) => appendMessage(`相手(${pub.publisher.id.substring(0,5)})`, data));
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

            const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
            video.attach(localVideo);
            audioPublish = await me.publish(audio); 
            videoPublish = await me.publish(video);

            statusDiv.innerText = "通話中 Room名 : " + roomName;

        } catch (e) {
            console.error(e);
            notifyError("接続エラー: " + e.message);
            startBtn.style.display = 'inline-block';
            roomNameInput.style.display = 'inline-block';
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
        if (me) await me.leave();
        location.reload();
    };
})();
