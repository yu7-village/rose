// public/script.js

// 修正済み：SkyWayStreamFactoryを @skyway-sdk/core からインポート
import { SkyWayContext, SkyWayRoom } from '@skyway-sdk/room'; 
import { SkyWayStreamFactory } from '@skyway-sdk/core';


// =========================================================
// DOM要素の取得
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
// =========================================================

/**
 * サーバーから認証トークンを取得する
 */
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
        // 1. ローカルストリーム（カメラとマイク）の取得 (coreパッケージのFactoryを使用)
        const videoStream = await SkyWayStreamFactory.createCameraStream(); 
        const audioStream = await SkyWayStreamFactory.createMicrophoneStream();
        
        localStreams = [videoStream, audioStream];

        // ローカル映像をDOMにアタッチ
        videoStream.attach(localVideo);

        // 2. Contextの作成 (App IDを使用)
        context = await SkyWayContext.Create({ 
            appId: config.appId, 
            rtcConfig: {
                iceServers: [{ urls: 'stun:stun.skyway.io:3478' }] 
            },
        });


        // 3. ルームへの接続 (P2P Room)
        room = await SkyWayRoom.FindOrCreate(context, {
            name: roomId,
            type: 'p2p', // P2P ルーム
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

    // ピアが参加したとき
    room.onPeerJoined.add(async ({ peer }) => {
        console.log(`ピア ${peer.id} が参加しました。`);
        
        // 参加したピアにローカルストリームを公開
        await room.publish({ streams: localStreams });
        
        // リモートピアのストリームが公開されたとき
        peer.onStreamPublished.add(async ({ publication }) => {
            console.log(`ピア ${peer.id} がストリームを公開しました。`);

            // ストリームを購読
            const subscribedStream = await room.subscribe(publication.id);

            // ストリームタイプをチェック
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

    // ピアが退出したとき
    room.onPeerLeft.add(({ peerId }) => {
        console.log(`ピア ${peerId} が退出しました。`);
        const videoEl = document.getElementById(`remote-video-${peerId}`);
        if (videoEl) {
             remoteMediaContainer.removeChild(videoEl);
        }
    });

    // ルームが閉じられたとき
    room.onClosed.add(() => {
        console.warn('ルームが閉じられました。');
        cleanup();
    });
}


/**
 * 接続切断後のリソース解放とUIリセット
 */
function cleanup() {
    // ストリームの停止
    localStreams.forEach(stream => {
        if (stream.track) {
            stream.track.stop();
        }
    });
    localStreams = [];

    // ルームのクローズ
    if (room) {
        room.close();
        room = null;
    }
    context = null;

    // DOMのリセット
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
