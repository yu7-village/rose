// script.js - 退出機能付き全文
import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } from 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.2.1/+esm';

const localVideo = document.getElementById('local-video');
const buttonJoin = document.getElementById('join-button');
const buttonLeave = document.getElementById('leave-button'); // 退出ボタン
const roomNameInput = document.getElementById('room-name');
const remoteMediaArea = document.getElementById('remote-media-area');

let room; // ルームへの参照を保持する変数
let me;   // 自分自身（Memberオブジェクト）を保持する変数

// --- 入室処理 ---
buttonJoin.onclick = async () => {
    if (roomNameInput.value === "") return;

    try {
        // 1. バックエンドからトークンを取得
        const response = await fetch(`https://skyway-token-backend.onrender.com/api/skyway-token?roomId=${roomNameInput.value}`);
        const data = await response.json();
        const { token } = data;

        console.log("トークン取得成功");

        // 2. SkyWayの初期化
        const context = await SkyWayContext.Create(token);

        // 3. ルームを探すか作成する
        room = await SkyWayRoom.FindOrCreate(context, {
            type: 'p2p',
            name: roomNameInput.value,
        });

        // 4. ルームに参加
        me = await room.join();
        console.log("入室完了:", me.id);

        // 5. カメラとマイクの取得・公開（Publish）
        const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
        video.attach(localVideo);
        await me.publish(audio);
        await me.publish(video);

        // 6. 相手のストリームを購読（Subscribe）する処理
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
                newMedia.autoplay = true;
            }
            stream.attach(newMedia);
            remoteMediaArea.appendChild(newMedia);
        };

        // 既にある投稿と、新しく入ってきた投稿の両方を購読対象にする
        room.onPublicationSubscribed.add(({ publication }) => subscribeAndAttach(publication));
        room.publications.forEach(subscribeAndAttach);

        // ボタンの状態を切り替え
        buttonJoin.innerText = "入室中";
        buttonJoin.disabled = true;
        buttonLeave.disabled = false;

    } catch (error) {
        console.error("エラーが発生しました:", error);
        alert("接続失敗: " + error.message);
    }
};

// --- 退出処理 ---
buttonLeave.onclick = async () => {
    if (!room || !me) return;

    try {
        // 1. ルームを去る（相手側の画面から自分の映像が消える）
        await me.leave();
        
        // 2. ルームオブジェクトを破棄してメモリを解放
        await room.dispose();

        // 3. 画面上の相手の映像要素をすべて削除
        remoteMediaArea.innerHTML = '';

        // 4. 自分のビデオプレビューを停止
        if (localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach(track => track.stop());
            localVideo.srcObject = null;
        }

        // 5. UIの状態を元に戻す
        buttonJoin.innerText = "入室する";
        buttonJoin.disabled = false;
        buttonLeave.disabled = true;

        console.log("正常に退出しました");
    } catch (error) {
        console.error("退出時にエラーが発生しました:", error);
    }
};
