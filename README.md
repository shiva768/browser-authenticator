# Browser Authenticator

ブラウザ上で2段階認証コード(TOTP/HOTP)を生成する Chrome 拡張 (MV3)。
[Authenticator-Extension/Authenticator](https://github.com/Authenticator-Extension/Authenticator) の機能を参考にした再実装です。

スタック: TypeScript / Vue 3 / Vite / `@crxjs/vite-plugin` / vitest

## 機能

- アカウント追加: 手入力、`otpauth://` URL、`otpauth-migration://`(Google Authenticator のエクスポート)、画面上のQRをドラッグ選択でスキャン、QR画像ファイル読み込み
- TOTP(SHA1/SHA256/SHA512、6/8桁、任意の更新間隔)と HOTP
- クリックでコードをコピー、カウントダウン表示、検索、ピン留め、ドラッグ並び替え、削除
- パスワード暗号化(PBKDF2-SHA256 600,000回 → AES-256-GCM)。復号鍵は `chrome.storage.session` に保持し、`chrome.alarms` で自動ロック(既定30分)

未対応(元リポジトリにはある): Steam / Battle.net / GOST、クラウドバックアップ同期、テーマ切替、多言語化、自動入力、ファイルへのエクスポート。

## 開発

```bash
npm install
npm test          # TOTP(RFC 6238)・base32・otpauth・暗号化のテスト
npm run build     # 型チェック + dist/ 生成
npm run dev       # 開発サーバ(HMR)
```

## Chrome に読み込む

1. `npm run build`
2. `chrome://extensions` を開き、右上の「デベロッパー モード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」で `dist/` を選択

## 補足

- 暗号化の仕様は元リポジトリ(Argon2 + CryptoJS)とは互換性がありません。移行は `otpauth://` / `otpauth-migration://` 経由で行ってください。
- パスワードを忘れるとデータは復元できません。
- QRスキャンは `activeTab` 権限で表示中タブを撮影し、`chrome://` などの制限ページでは使えません。
