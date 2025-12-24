
// server.js

const express = require('express');
const path = require('path');
// トークン生成ライブラリをインポート
const { SkyWayToken } = require('@skyway-sdk/token'); 

// 環境変数はRenderで設定します。
const SKYWAY_APP_ID = process.env.SKYWAY_APP_ID;
const SKYWAY_SECRET_KEY = process.env.SKYWAY_SECRET_KEY;
const PORT = process.env.PORT || 3000;

if (!SKYWAY_APP_ID || !SKYWAY_SECRET_KEY) {
  console.error("エラー: 環境変数 SKYWAY_APP_ID または SKYWAY_SECRET_KEY が設定されていません。");
  process.exit(1);
}

const app = express();

// 1. 静的ファイルの配信設定
// public フォルダ内のファイルをブラウザに提供します
app.use(express.static(path.join(__dirname, 'public')));
// 2. SkyWay SDKをブラウザに公開する設定 (モジュール解決のため)
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// 3. SkyWayの認証トークンを提供するエンドポイント
app.get('/api/skyway-token', (req, res) => {
    // ピアIDはクライアントで生成せず、サーバー側でランダムに生成
    const peerId = 'p2p-peer-' + Date.now(); 

    // SkyWayTokenを生成
    const token = new SkyWayToken({
        app: {
            id: SKYWAY_APP_ID,
            secret: SKYWAY_SECRET_KEY,
        },
        peer: {
            id: peerId,
            // P2P ルームを操作する権限を与える
            scope: [{
                service: 'room',
                actions: ['write'],
                // resourceのroomをワイルドカードにし、type: 'p2p' を指定
                resource: { room: 'room-name:*', name: peerId, type: 'p2p' } 
            }],
        },
        ttl: 3600 // 1時間有効
    }).encode();

    res.json({
        appId: SKYWAY_APP_ID,
        token: token,
        peerId: peerId
    });
});

app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
  console.log(`アクセス: http://localhost:${PORT}`);
});
