// server.js

const express = require('express');
const path = require('path');





// ★★★ 最終調整: SkyWayToken のインポート形式。default を最優先する。 ★★★
const SkyWayTokenModule = require('@skyway-sdk/token');

// ほとんどのモダンJSパッケージでは、default が実際のクラスを指します。
// .default が存在する場合はそれを使い、なければモジュール自体を使う。
const SkyWayToken = SkyWayTokenModule.default || SkyWayTokenModule;
// ★★★ 最終調整ここまで ★★★




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
app.use(express.static(path.join(__dirname, 'public')));
// 2. SkyWay SDKをブラウザに公開する設定 (モジュール解決のために必須)
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// 3. SkyWayの認証トークンを提供するエンドポイント
app.get('/api/skyway-token', (req, res) => {
    const peerId = 'p2p-peer-' + Date.now(); 

    // デバッグログ: 環境変数が読み込まれていることを確認 (Renderのログに出力されます)
    console.log(`[DEBUG LOG 1] App ID Available: ${!!SKYWAY_APP_ID}`);
    
    try {
        const token = new SkyWayToken({
            app: {
                id: SKYWAY_APP_ID,
                secret: SKYWAY_SECRET_KEY,
            },
            peer: {
                id: peerId,
                scope: [{
                    service: 'room',
                    actions: ['write'],
                    resource: { room: 'room-name:*', name: peerId, type: 'p2p' } 
                }],
            },
            ttl: 3600 // 1時間有効
        }).encode();

        console.log(`[DEBUG LOG 2] Token generated successfully.`);

        res.json({
            appId: SKYWAY_APP_ID,
            token: token,
            peerId: peerId
        });
        
    } catch (error) {
        // トークン生成時のエラーをログに出力
        console.error(`[DEBUG LOG 3] Token generation failed: ${error.message}`);
        res.status(500).send('Internal Server Error during token generation. Check Render logs for details.');
    }
});

app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
  console.log(`アクセス: http://localhost:${PORT}`);
});
