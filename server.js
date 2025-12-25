// server.js

const express = require('express');
const path = require('path');
const { SkyWayToken } = require('@skyway-sdk/token'); 

// 環境変数はRenderで設定します。
const SKYWAY_APP_ID = process.env.SKYWAY_APP_ID;
const SKYWAY_SECRET_KEY = process.env.SKYWAY_SECRET_KEY;
const PORT = process.env.PORT || 3000;

if (!SKYWAY_APP_ID || !SKYWAY_SECRET_KEY) {
  console.error("エラー: 環境変数 SKYWAY_APP_ID または SKYWAY_SECRET_KEY が設定されていません。");
  process.exit(1);
}







// ★★★ ここからデバッグ用コード ★★★
console.log(`Debug Check: App ID Length is ${SKYWAY_APP_ID ? SKYWAY_APP_ID.length : 0}`);
// Secret Key は機密情報なので、長さのみを確認します。
console.log(`Debug Check: Secret Key Length is ${SKYWAY_SECRET_KEY ? SKYWAY_SECRET_KEY.length : 0}`); 
// ★★★ ここまでデバッグ用コード ★★★











const app = express();

// 1. 静的ファイルの配信設定
app.use(express.static(path.join(__dirname, 'public')));
// 2. SkyWay SDKをブラウザに公開する設定 (モジュール解決のために必須)
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// 3. SkyWayの認証トークンを提供するエンドポイント
app.get('/api/skyway-token', (req, res) => {
    const peerId = 'p2p-peer-' + Date.now(); 





// ★★★ デバッグログ 1: 環境変数の確認 ★★★
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

        // ★★★ デバッグログ 2: トークン生成成功の確認 ★★★
        console.log(`[DEBUG LOG 2] Token generated successfully.`);
        
        res.json({
            appId: SKYWAY_APP_ID,
            token: token,
            peerId: peerId
        });
        
    } catch (error) {
        // ★★★ デバッグログ 3: トークン生成失敗とエラー内容の記録 ★★★
        console.error(`[DEBUG LOG 3] Token generation failed: ${error.message}`);
        // クライアントには 500 エラーを返し、Renderログに詳細を残す
        res.status(500).send('Internal Server Error during token generation.');
    }
});







app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
  console.log(`アクセス: http://localhost:${PORT}`);
});
