// server.js (最終確定版: CommonJS + 動的インポート)

const express = require('express');
const path = require('path');

// SkyWayToken のインポートを動的に行うため、ここでは定義しません。
let SkyWayToken; 
let SkyWayTokenPromise = null;

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
// 2. SkyWay SDKをブラウザに公開する設定
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// 3. SkyWayToken クラスの準備 (サーバー起動時に一度だけ実行)
// ★★★ 最終解決: サーバー起動時に非同期で SkyWayToken クラスを取得する ★★★
SkyWayTokenPromise = import('@skyway-sdk/token')
    .then(module => {
        // パッケージが { SkyWayToken: Class } または { default: Class } のどちらかでエクスポートされていても対応
        return module.SkyWayToken || module.default; 
    })
    .catch(error => {
        console.error("Critical Error: Failed to import SkyWayToken module.", error);
        process.exit(1);
    });
// ★★★ 最終解決ここまで ★★★

// 4. SkyWayの認証トークンを提供するエンドポイント
app.get('/api/skyway-token', async (req, res) => { // ★関数を async に変更★
    const peerId = 'p2p-peer-' + Date.now(); 

    console.log(`[DEBUG LOG 1] App ID Available: ${!!SKYWAY_APP_ID}`);
    
    try {
        // トークンクラスが準備できるのを待つ
        SkyWayToken = await SkyWayTokenPromise; 
        
        if (!SkyWayToken || typeof SkyWayToken !== 'function') {
             throw new Error("SkyWayToken is not a valid constructor even after dynamic import.");
        }

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
            ttl: 3600 
        }).encode();

        console.log(`[DEBUG LOG 2] Token generated successfully.`);

        res.json({
            appId: SKYWAY_APP_ID,
            token: token,
            peerId: peerId
        });
        
    } catch (error) {
        // エラーログ
        console.error(`[DEBUG LOG 3] Token generation failed: ${error.message}`);
        res.status(500).send('Internal Server Error during token generation. Check Render logs for details.');
    }
});

app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
  console.log(`アクセス: http://localhost:${PORT}`);
});
