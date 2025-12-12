const express = require('express');
const cors = require('cors');
const { SkyWayAuthToken, RoomScope, MemberScope, uuidV4 } = require('@skyway-sdk/token');
require('dotenv').config();

const app = express();   // ← ここで app を定義
const PORT = 3000;

// CORS を許可（ローカル開発用）
app.use(cors());

// トークン生成 API
app.get('/token', (req, res) => {
  const memberId = uuidV4();

  const token = new SkyWayAuthToken({
    jti: uuidV4(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 有効期限60分
    scope: {
      app: {
        id: process.env.SKYWAY_APP_ID,
        turn: true,
        actions: ['read'],
        rooms: [
          new RoomScope({
            id: 'test-room',
            actions: ['write'],
            members: [
              new MemberScope({
                id: memberId,
                actions: ['write'],
              }),
            ],
          }),
        ],
      },
    },
  });

  res.json({ token: token.encode(), memberId });
});

// 静的ファイル配信（public フォルダ）
app.use(express.static('public'));

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
