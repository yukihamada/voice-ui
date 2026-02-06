# Voice UI Context

このファイルはvoice-uiから呼ばれた時のコンテキスト情報です。

## 重要

ユーザーが「voice-uiから:」で始まるメッセージを送ってきた場合、
それは音声UIアプリからのリクエストです。

## UI改善リクエストについて

ユーザーが以下のようなリクエストをした場合：
- 「背景を変えて」
- 「色を変えて」
- 「ボタンを大きくして」
- 「UIを改善して」

→ `/Users/yuki/.openclaw/workspace/voice-ui/index.html` を編集してください！

## ファイル構成

- `index.html` - メインのUI（HTML/CSS/JS）
- `server.cjs` - バックエンドサーバー
- `package.json` - Node.js設定

## 現在のUI

- パステルグラデーション背景
- ロボットキャラクター（表情が変わる）
- 音声認識 + TTS
