
(async () => {



const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
let dataPublish; // チャットデータ用のパブリケーション

// --- メッセージを表示する補助関数 ---
function appendMessage(sender, text) {
    const msg = document.createElement('div');
    msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight; // 常に最新を表示
}



    const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = await import('https://cdn.jsdelivr.net/npm/@skyway-sdk/room@latest/+esm');

    const BACKEND_URL = "https://skyway-token-backend.onrender.com";
    const ROOM_NAME = "p2p-room";

    const startBtn = document.getElementById('start-btn');
    const leaveBtn = document.getElementById('leave-btn');
    const videoBtn = document.getElementById('toggle-video-btn');
    const audioBtn = document.getElementById('toggle-audio-btn');
    const statusDiv = document.getElementById('status');
    const localVideo = document.getElementById('local-video');
    const videoGrid = document.getElementById('video-grid');
    const statusLamp = document.getElementById('status-lamp');
    const serverText = document.getElementById('server-text');

    let me; 
    let videoPublish; 
    let audioPublish; 

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
            const room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: ROOM_NAME });
            
            me = await room.join(); // ここで me を確定させる






// --- startBtn.onclick の中、me = await room.join(); の後あたりに追加 ---
// 1. データ送信用ストリームの作成とパブリッシュ
const dataStream = await SkyWayStreamFactory.createDataStream();
dataPublish = await me.publish(dataStream);
chatContainer.style.display = 'block';

// 2. 相手からのチャット（データ）を受信する処理
const subscribeData = async (pub) => {
    if (pub.publisher.id === me.id) return;
    if (pub.contentType === 'data') {
        const { stream } = await me.subscribe(pub.id);
        stream.onData.add((data) => {
            appendMessage(`相手(${pub.publisher.id.substring(0,5)})`, data);
        });
    }
};

// 既存の subscribe 処理と並行して実行
room.publications.forEach(subscribeData);
room.onStreamPublished.add((e) => subscribeData(e.publication));

// 3. 送信ボタンの処理
sendBtn.onclick = () => {
    const text = chatInput.value;
    if (!text) return;
    dataStream.write(text); // データを送信
    appendMessage("自分", text);
    chatInput.value = "";
};






            // 参加者リストの初期化とイベント登録
            updateMemberList(room);
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

            statusDiv.innerText = "通話中";

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

        } catch (e) {
            console.error(e);
            statusDiv.innerText = "エラー: " + e.message;
            startBtn.style.display = 'inline-block';
        }
    };

    // --- ON/OFFボタン ---
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
