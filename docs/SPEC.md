# 仕様

Browser Authenticator の機能・データ・セキュリティ設計。実装は `src/` を参照。

## 1. 機能

### アカウントの追加
| 方法 | 内容 |
|---|---|
| 手入力 | 発行元、アカウント、シークレット(base32)、種別(TOTP/HOTP)、アルゴリズム、桁数、更新間隔/カウンタ初期値 |
| URL | `otpauth://totp/...` `otpauth://hotp/...`、`otpauth-migration://`(Google Authenticator のエクスポート。複数件) |
| 画面上のQR | ポップアップのボタン → 表示中タブ上でドラッグ選択 → デコードして保存(ポップアップ専用) |
| QR画像 | ファイル選択 / クリップボードの画像を貼り付け(Ctrl/⌘+V) |
| テキスト貼り付け | 追加画面を開いた状態で、入力欄の外に `otpauth...` を貼り付けると追加 |

同じ `issuer / account / secret` は重複として追加されない。

### コード表示
- TOTP: SHA1/SHA256/SHA512、6/8桁、任意の period。円形のカウントダウン、残り5秒で赤表示
- HOTP: 初期はマスク表示。クリックまたは ↻ で現在の counter のコードを生成し、counter を +1 して保存
- クリックでコピー(コピー済み表示は約1.2秒)

### 一覧の操作
- 検索(発行元・アカウント名)。検索中はグループを全て開く
- 編集モード(✎): ピン留め、QR表示(▦)、削除(確認あり)、グループ設定、ドラッグ並び替え
- **グループ**: アカウントごとにグループ名を設定。見出しクリックで開閉。見出しの名前変更(空にすると解散、既存名なら統合)
- **並び替え**(編集モード・検索なし):
  - アカウント → 別アカウントへドロップ: その手前へ挿入(グループも移る)
  - アカウント → グループ見出しへ: そのグループの末尾へ
  - 見出し → 別の見出しへ: グループごとその手前へ。「未分類」は先頭固定
  - ピン留めは各グループ内の先頭。ピン留めの手前に通常アカウントを置いても、ピン留めの後ろに入る
- QRコード出力: `otpauth://` URL を生成し、白背景・黒ドットで表示。URL のコピーも可。閉じるとメモリから破棄

### 表示形態
- ポップアップ(幅 340px)と、フルタブ(ヘッダーの ⧉)。同じ Vue アプリを `?view=tab` で切り替える
- フルタブでは画面スキャンは使えない(QR画像・貼り付け・URL・手入力は可)

### セキュリティ設定
- パスワードの設定・解除、今すぐロック、自動ロック(分、0で無効。既定30分)

## 2. データモデル

```ts
interface Entry {
  id: string;            // crypto.randomUUID()
  issuer: string;
  account: string;
  secret: string;        // base32 (大文字・空白なし)
  type: "totp" | "hotp";
  counter: number;       // HOTP: 次に使う値
  period: number;        // TOTP: 秒
  digits: number;        // 6 | 8
  algorithm: "SHA1" | "SHA256" | "SHA512";
  pinned: boolean;
  group?: string;        // 未設定・空文字 = 未分類(既存データ互換のため省略可)
}
```

表示順と保存順は一致させる。`buildSections()`(`src/lib/groups.ts`)が「未分類 → グループ(配列内の初出順)」に分け、各セクション内でピン留めを先頭にする。並び替え後はこの順で配列を保存し直す。

## 3. 保存形式

| 場所 | キー | 内容 |
|---|---|---|
| `chrome.storage.local` | `vault` | 平文 `{v:1, entries}` または暗号化 `{v:1, enc:{salt, iv, data, iterations}}` |
| `chrome.storage.local` | `settings` | `{autolockMinutes}`(秘密情報なし) |
| `chrome.storage.session` | `cachedKey` | 復号鍵(raw, base64)。ブラウザ終了で消える |
| `chrome.storage.session` | `collapsedGroups` | グループの開閉状態(グループ名は暗号化対象のため平文で永続化しない) |

## 4. セキュリティ設計

- **暗号化**: パスワード → PBKDF2-SHA256(600,000回、16byte salt) → AES-256-GCM。Vault 全体を1つの blob として暗号化する。GCM の認証タグ検証失敗 = パスワード誤り(別途 verifier は持たない)
- **ロック解除後**: 派生鍵を `chrome.storage.session` に保持。popup を閉じても再入力不要。操作のたびに自動ロックの alarm を延長(popup 側は60秒に1回まで)。期限切れ・手動ロックで鍵を破棄
- **パスワード解除**: 現在のパスワードで復号確認してから平文に戻す
- **パスワード忘れ**: 復元不可
- **QRスキャン**: `activeTab` 権限で表示中タブのみ撮影。`chrome://` など制限ページでは不可。ロック中は保存せず通知する
- **QR出力**: シークレットを含むため注意書きを表示。`otpauth-migration://` 形式での出力は未対応
- 元リポジトリ(Argon2 + CryptoJS)とは暗号形式の互換性なし。移行は `otpauth://` / `otpauth-migration://` 経由

## 5. メッセージフロー(QRスキャン)

```
popup  --startScan-->  background : active tab に content script を executeScript
content(onExecute) --captureForScan--> background : captureVisibleTab して画像を返す(オーバーレイ表示前)
content : ドラッグ選択 → 切り出し → jsQR → --qrDecoded--> background
background : parseOtpUri → vault を open(キャッシュ鍵) → appendUnique → save → 結果を返す
content : 結果をトーストで表示
```

## 6. 権限

`activeTab` / `storage` / `alarms` / `scripting`。ホスト権限・`tabs` 権限・`clipboardWrite` は不要(コピーはユーザー操作中の `navigator.clipboard.writeText`)。

## 7. テスト

`npm test`(vitest): RFC 6238 のテストベクタ(SHA1/256/512)、base32、`otpauth` の解析と生成の往復、`otpauth-migration` の解析、暗号化の往復・誤パスワード、生成した QR を jsQR で読み戻す往復、グループ・並び替え操作。

**未検証**(実機のみで確認できるもの): ポップアップ/タブ表示、画面スキャンのオーバーレイ、クリップボード貼り付け、ドラッグ操作、自動ロックの alarm。

## 8. 未対応(元リポジトリにはある)

Steam / Battle.net / hex / GOST、クラウドバックアップ同期(Drive/Dropbox/OneDrive)、テーマ切替、多言語化、自動入力、ファイルへのエクスポート、ブラウザ間同期、スマートフィルタ、時刻同期。

検討中: Touch ID でのロック解除(WebAuthn PRF)、パスワードマネージャー連携(`autocomplete="current-password"`)。
