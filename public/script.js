// public/script.js (P2Pロジック最終確定版)

// 1. SkyWayRoom は @skyway-sdk/room からインポート
import { SkyWayRoom } from '@skyway-sdk/room'; 

// 2. SkyWayContext と SkyWayStreamFactory は @skyway-sdk/core からインポート
// ※ 厳密には SkyWayContext は room パッケージに同梱されているが、
//    コア機能として core パッケージからインポートするのが慣習となっている可能性が高い。
//    前回coreで失敗しているため、今回は core のインポートのまま進める。
import { SkyWayContext, SkyWayStreamFactory } from '@skyway-sdk/core';


// =========================================================
// DOM要素の取得
// ... (変更なし) ...
// =========================================================
const joinButton = document.getElementById('join-button');
const leaveButton = document.getElementById('leave-button');
const localVideo = document.getElementById('local-video');
const remoteMediaContainer = document.getElementById('remote-media-container');
const roomIdInput = document.getElementById('room-id-input');
const roomNameDisplay = document.getElementById('room-name-display');

// =========================================================
// グローバル変数
// =========================================================
let context = null;
let room = null;
let localStreams = []; 


// =========================================================
// 初期化と設定取得
// ... (変更なし) ...
// =========================================================
async function fetchSkyWayToken() {
    try {
        const response = await fetch('/api/skyway-token');
        if (!response.ok) {
            throw new Error('SkyWayトークンの取得に失敗しました。');
        }
        return response.json();
    } catch (error) {
        console.error('トークン取得エラー:', error);
        alert('トークンの取得に失敗しました。サーバー側の設定を確認してください。');
        return null;
    }
}


// =========================================================
// P2P通話ロジック
// =========================================================

/**
 * ルームに入室する
 */
async function joinRoom() {
    const config = await fetchSkyWayToken();
    if (!config) return;

    const roomId = roomIdInput.value;
    if (!roomId) {
        alert('ルームIDを入力してください。');
        return;
    }

    // UI更新
    joinButton.disabled = true;
    roomIdInput.disabled = true;
    
    try {
        // 1. ローカルストリーム（カメラとマイク）の取得
        const videoStream = await SkyWayStreamFactory.createCameraStream(); 
        const audioStream = await SkyWayStreamFactory.createMicrophoneStream();
        
        localStreams = [videoStream, audioStream];

        // ローカル映像をDOMにアタッチ
        videoStream.attach(localVideo);

        // 2. Contextの作成
        context = await SkyWayContext.Create({ // SkyWayContext は @skyway-sdk/core からインポート
            appId: config.appId, 
            rtcConfig: {
                iceServers: [{ urls: 'stun:stun.skyway.io:3478' }] 
            },
        });


        // 3. ルームへの接続 (P2P Room)
        room = await SkyWayRoom.FindOrCreate(context, { // SkyWayRoom は @skyway-sdk/room からインポート
            name: roomId,
            type: 'p2p', 
            token: config.token 
        });

        // 4. ローカルストリームの公開
        await room.join({ streams: localStreams });

        // 5. イベントリスナーの設定
        setupRoomEventListeners();
        
        // UI更新
        roomNameDisplay.textContent = roomId;
        leaveButton.disabled = false;
        
        console.log(`P2P ルーム ${roomId} に入室しました。`);

    } catch (error) {
        console.error('ルーム入室中にエラーが発生しました:', error);
        alert('ルーム入室に失敗しました。ブラウザのカメラ・マイクへのアクセスを許可しているか、サーバー設定を確認してください。');
        cleanup();
    }
}

/**
 * ルームイベントリスナーを設定する
 */
function setupRoomEventListeners() {
    if (!room) return;
    
    room.onPeerJoined.add(async ({ peer }) => {
        console.log(`ピア ${peer.id} が参加しました。`);
        await room.publish({ streams: localStreams });
        
        peer.onStreamPublished.add(async ({ publication }) => {
            console.log(`ピア ${peer.id} がストリームを公開しました。`);

            const subscribedStream = await room.subscribe(publication.id);

            if (subscribedStream.contentType === 'video' || subscribedStream.contentType === 'audio') {
                 const remoteVideo = document.createElement('video');
                 remoteVideo.autoplay = true;
                 remoteVideo.playsInline = true;
                 remoteVideo.controls = true; 
                 remoteVideo.id = `remote-video-${publication.publisher.id}`;
                 
                 subscribedStream.attach(remoteVideo);
                 remoteMediaContainer.appendChild(remoteVideo);
                 console.log(`リモートピア ${publication.publisher.id} のストリームを購読し、表示しました。`);
            }
        });
    });

    room.onPeerLeft.add(({ peerId }) => {
        console.log(`ピア ${peerId} が退出しました。`);
        const videoEl = document.getElementById(`remote-video-${peerId}`);
        if (videoEl) {
             remoteMediaContainer.removeChild(videoEl);
        }
    });

    room.onClosed.add(() => {
        console.warn('ルームが閉じられました。');
        cleanup();
    });
}


/**
 * 接続切断後のリソース解放とUIリセット
 */
function cleanup() {
    localStreams.forEach(stream => {
        if (stream.track) {
            stream.track.stop();
        }
    });
    localStreams = [];

    if (room) {
        room.close();
        room = null;
    }
    context = null;

    localVideo.srcObject = null;
    remoteMediaContainer.innerHTML = '<h2>相手</h2>';
    
    roomNameDisplay.textContent = '未接続';
    joinButton.disabled = false;
    leaveButton.disabled = true;
    roomIdInput.disabled = false;
}

/**
 * ルームから退出する
 */
function leaveRoom() {
    if (room) {
        room.close();
        console.log(`ルーム ${room.name} から退出しました。`);
    }
    cleanup();
}

// =========================================================
// イベントリスナーの登録
// =========================================================
joinButton.addEventListener('click', joinRoom);
leaveButton.addEventListener('click', leaveRoom);
