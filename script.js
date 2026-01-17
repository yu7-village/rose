const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = @skyway-sdk/room;

const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');

buttonJoin.onclick = async () => {
    if (roomNameInput.value === "") return;

    try {
        // 1. あなたのバックエンドからトークンを取得
        const response = await fetch(`https://skyway-token-backend.onrender.com/api/skyway-token?roomId=${roomNameInput.value}`);
        const data = await response.json();
        const { token } = data;

        console.log("トークン取得成功:", token);

        // 2. SkyWayのコンテキストを作成
        const context = await SkyWayContext.Create(token);

        // 3. ルームを探すか作成する
        const room = await SkyWayRoom.FindOrCreate(context, {
            type: 'p2p',
            name: roomNameInput.value,
        });

        // 4. ルームに参加
        const me = await room.join();
        console.log("参加完了:", me.id);

        // 5. 自分のカメラとマイクを取得して公開（Publish）
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);

        // 6. 相手のストリームが流れてきた時の処理（Subscribe）
        const subscribeAndAttach = async (publication) => {
            if (publication.publisher.id === me.id) return;

            const { stream } = await me.subscribe(publication.id);
            let newMedia;
            if (stream.contentType === 'video') {
                newMedia = document.createElement('video');
                newMedia.playsInline = true;
                newMedia.autoplay = true;
                newMedia.width = 300;
            } else {
                newMedia = document.createElement('audio');
                newMedia.controls = true;
                newMedia.autoplay = true;
            }
            stream.attach(newMedia);
            remoteMediaArea.appendChild(newMedia);
        };

        room.onPublicationSubscribed.add(({ publication }) => subscribeAndAttach(publication));
        room.publications.forEach(subscribeAndAttach);

        buttonJoin.innerText = "入室中";
        buttonJoin.disabled = true;

    } catch (error) {
        console.error("エラーが発生しました:", error);
        alert("接続に失敗しました。詳細はコンソールを確認してください。");
    }
};
