// server.js (最終確定版: ESM + CommonJS ハイブリッドインポート)

import express from 'express';
import path from 'path';
// ★★★ 最終確定: SkyWayToken インポートの最終修正 ★★★
import SkyWayTokenModule from '@skyway-sdk/token';
const { SkyWayToken } = SkyWayTokenModule;
// ★★★ 最終確定ここまで ★★★

// 環境変数はRenderで設定します。
const SKYWAY_APP_ID = process.env.SKYWAY_APP_ID;
const SKYWAY_SECRET_KEY = process.env.SKYWAY_SECRET_KEY;
// path.resolve() が ESM 環境で動作するように修正
const __dirname = path.resolve(); 
const PORT = process.env.PORT || 3000;

if (!SKYWAY_APP_ID || !SKYWAY_SECRET_KEY) {
  console.error("エラー: 環境変数 SKYWAY_APP_ID または SKYWAY_SECRET_KEY が設定されていません。");
  // process.exit(1); は Express の起動前に実行されるため、そのままにします
}

const app = express();

// 1. 静的ファイルの配信設定
app.use(express.static(path.join(__dirname, 'public')));
// 2. SkyWay SDKをブラウザに公開する設定
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// 3. SkyWayの認証トークンを提供するエンドポイント
app.get('/api/skyway-token', (req, res) => {
    const peerId = 'p2p-peer-' + Date.now(); 

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
            ttl: 3600 
        }).encode();

        console.log(`[DEBUG LOG 2] Token generated successfully.`);

        res.json({
            appId: SKYWAY_APP_ID,
            token: token,
            peerId: peerId
        });
        
    } catch (error) {
        console.error(`[DEBUG LOG 3] Token generation failed: ${error.message}`);
        res.status(500).send('Internal Server Error during token generation. Check Render logs for details.');
    }
});

app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
  console.log(`アクセス: http://localhost:${PORT}`);
});
