# Browser Authenticator

2段階認証コード(TOTP/HOTP)を生成する Chrome 拡張 (MV3)。[Authenticator-Extension/Authenticator](https://github.com/Authenticator-Extension/Authenticator) の機能を参考にした再実装。
機能・データ形式・セキュリティ設計の詳細は [docs/SPEC.md](docs/SPEC.md) を参照。

## スタック

TypeScript / Vue 3 (Composition API, `<script setup>`) / Vite / `@crxjs/vite-plugin` / vitest。ビルド時に SFC をコンパイルするので MV3 の CSP(`eval` 禁止)に抵触しない。

## コマンド

```bash
npm test          # vitest。ロジックは lib/ に集約してここでテストする
npm run typecheck # vue-tsc --noEmit
npm run build     # 型チェック + dist/ 生成 (dist/ を chrome://extensions に読み込む)
```

動作確認は `npm run build` → `chrome://extensions` で `dist/` を「パッケージ化されていない拡張機能」として読み込み(更新は ↻)。**プロジェクトルートではなく `dist/` を選ぶ**。

## 構成

```
manifest.config.ts       crxjs の manifest 定義(権限はここ)
src/lib/                 UI/Chrome 非依存のロジック(テスト対象)
  otp.ts otpauth.ts base32.ts   OTP生成・URL/migration の解析と生成
  crypto.ts                     PBKDF2 + AES-GCM
  vault.ts                      保存・ロック・自動ロック (chrome.storage 依存)
  groups.ts                     グループ化・並び替えの純粋関数
  ui-state.ts                   グループ開閉状態 (storage.session)
src/popup/               Vue UI。ポップアップとフルタブで同じ画面を使う(?view=tab)
src/background/service-worker.ts   自動ロック alarm、QRスキャンの撮影・保存
src/content/scan.ts      QRスキャンのオーバーレイ(activeTab で動的注入)
tests/otp.test.ts        RFC 6238 テストベクタ、QR往復、グループ操作 ほか
```

## ハマりどころ(変更時の注意)

- **エントリのファイル名を重複させない**: crxjs はチャンク名をファイル名から作る。`background/index.ts` と `content/index.ts` のように同名だと `service-worker-loader.js` が別チャンクを指し、バックグラウンドが動かなくなる(実際に発生)。`service-worker.ts` / `scan.ts` と分けてある。ビルド後は `dist/service-worker-loader.js` の参照先を確認すること。
- **TypeScript は 5.9 系に固定**: TypeScript 7 では `vue-tsc` が動かない。
- **毎秒再描画される**: TOTP のカウントダウンのため `now` が毎秒更新され、popup 全体が再描画される。`<input :value="...">` で束縛すると入力中の文字が書き戻されて消え、datalist も閉じる。入力欄は `v-model` + draft ref(`EntryItem.vue` の `groupDraft`、`GroupNameInput.vue`)にする。
- **content script は pull 方式**: `executeScript` は動的 import の完了を待たない。content 側の `onExecute()`(crxjs ローダーが呼ぶ)が background に `captureForScan` を要求して画像を受け取る。`sendMessage` で push しない(初回に受信側が無い競合になる)。
- **HOTP の counter は「次に使う値」**(otpauth 仕様)。表示時に現在の counter でコードを作り、それから +1 して保存する。
- **QRスキャンはポップアップ専用**: フルタブでは「表示中のタブ」が拡張自身になるため無効にしてある(`isTabView`)。
- **権限は最小**: `activeTab` `storage` `alarms` `scripting`。`tabs` 権限は付けていない(`tabs.query` の `url` フィルタに必要になるため使わない)。

## 方針

- 秘密情報(シークレット、パスワード、グループ名)を平文で永続化しない。`chrome.storage.local` に平文で置くのは設定(自動ロック分数)だけ。
- ロジックは `src/lib/` に置いてテストを書く。UI は薄く保つ。
- コミットは依頼されたときだけ行う。
