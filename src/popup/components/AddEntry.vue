<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import jsQR from "jsqr";
import { parseOtpUri } from "../../lib/otpauth";
import { base32Decode } from "../../lib/base32";
import { isTabView } from "../mode";
import type { Algorithm, NewEntry, OtpType } from "../../lib/types";

const emit = defineEmits<{ add: [entries: NewEntry[]]; cancel: [] }>();

const tab = ref<"manual" | "uri" | "image">("manual");
const error = ref("");

const form = ref({
  issuer: "", account: "", secret: "",
  type: "totp" as OtpType, algorithm: "SHA1" as Algorithm,
  digits: 6, period: 30, counter: 0,
});
const uri = ref("");

function fail(e: unknown) {
  error.value = e instanceof Error ? e.message : String(e);
}

function submitManual() {
  try {
    const secret = form.value.secret.replace(/\s/g, "").toUpperCase();
    base32Decode(secret); // 形式検証
    emit("add", [{ ...form.value, secret }]);
  } catch (e) {
    fail(e);
  }
}

function submitUri() {
  try {
    emit("add", parseOtpUri(uri.value));
  } catch (e) {
    fail(e);
  }
}

async function onImage(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await decodeImage(file);
  input.value = ""; // 同じファイルを続けて選べるようにする
}

// 追加画面を開いている間は、どのタブでも画像・otpauth テキストを貼り付けられる
async function onPaste(ev: ClipboardEvent) {
  const items = [...(ev.clipboardData?.items ?? [])];
  const img = items.find((i) => i.type.startsWith("image/"))?.getAsFile();
  if (img) {
    ev.preventDefault();
    tab.value = "image";
    return decodeImage(img);
  }
  // 入力欄への通常の貼り付けは邪魔しない
  const t = ev.target as HTMLElement;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
  const text = ev.clipboardData?.getData("text/plain") ?? "";
  if (text.trim().startsWith("otpauth")) {
    ev.preventDefault();
    uri.value = text.trim();
    tab.value = "uri";
    submitUri();
  }
}
onMounted(() => document.addEventListener("paste", onPaste));
onBeforeUnmount(() => document.removeEventListener("paste", onPaste));

async function decodeImage(file: Blob) {
  error.value = "";
  try {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height);
    const result = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
    if (!result) throw new Error("QRコードを読み取れませんでした");
    emit("add", parseOtpUri(result.data));
  } catch (e) {
    fail(e);
  }
}

async function scan() {
  error.value = "";
  if (isTabView) {
    // タブ表示では「表示中のタブ」が拡張機能自身になるため、他ページのQRを撮影できない
    error.value = "画面スキャンはポップアップから使ってください(QR画像ファイルは読み込めます)";
    return;
  }
  const res = await chrome.runtime.sendMessage({ action: "startScan" });
  if (res?.ok) window.close(); // ポップアップを閉じて画面上のQRを選択してもらう
  else error.value = res?.message ?? "スキャンを開始できませんでした";
}
</script>

<template>
  <div>
    <div class="tabs">
      <button :class="{ active: tab === 'manual' }" @click="tab = 'manual'">手入力</button>
      <button :class="{ active: tab === 'uri' }" @click="tab = 'uri'">URL</button>
      <button :class="{ active: tab === 'image' }" @click="tab = 'image'">QR</button>
    </div>

    <form v-if="tab === 'manual'" @submit.prevent="submitManual">
      <label>発行元<input v-model="form.issuer" placeholder="例: GitHub" /></label>
      <label>アカウント<input v-model="form.account" placeholder="例: alice@example.com" required /></label>
      <label>シークレットキー<input v-model="form.secret" autocomplete="off" required /></label>
      <label>種別
        <select v-model="form.type"><option value="totp">時間ベース (TOTP)</option><option value="hotp">カウンタベース (HOTP)</option></select>
      </label>
      <details>
        <summary class="note">詳細設定</summary>
        <label>アルゴリズム
          <select v-model="form.algorithm"><option>SHA1</option><option>SHA256</option><option>SHA512</option></select>
        </label>
        <label>桁数<select v-model.number="form.digits"><option :value="6">6</option><option :value="8">8</option></select></label>
        <label v-if="form.type === 'totp'">更新間隔(秒)<input v-model.number="form.period" type="number" min="1" /></label>
        <label v-else>カウンタ初期値<input v-model.number="form.counter" type="number" min="0" /></label>
      </details>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="row"><button class="primary">追加</button><button type="button" @click="emit('cancel')">キャンセル</button></div>
    </form>

    <form v-else-if="tab === 'uri'" @submit.prevent="submitUri">
      <label>otpauth:// または otpauth-migration:// の URL
        <input v-model="uri" placeholder="otpauth://totp/..." autocomplete="off" required />
      </label>
      <p class="note">Google Authenticator のエクスポート(otpauth-migration)も読み込めます。</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="row"><button class="primary">追加</button><button type="button" @click="emit('cancel')">キャンセル</button></div>
    </form>

    <div v-else class="panel">
      <button class="primary" @click="scan">画面上のQRコードをスキャン</button>
      <p class="note">ポップアップが閉じ、表示中のページ上でQRコードをドラッグで囲みます。</p>
      <p class="paste-hint">QRコードの画像をコピーして、この画面で <kbd>Ctrl/⌘ + V</kbd> で貼り付けられます。</p>
      <label>QR画像ファイルから読み込む<input type="file" accept="image/*" @change="onImage" /></label>
      <p v-if="error" class="error">{{ error }}</p>
      <button @click="emit('cancel')">キャンセル</button>
    </div>
  </div>
</template>

<style scoped>
.row { display: flex; gap: 8px; }
.paste-hint { margin: 0; padding: 10px; border: 1px dashed var(--line); border-radius: 6px; color: var(--muted); font-size: 13px; text-align: center; }
kbd { font: 12px ui-monospace, Menlo, monospace; border: 1px solid var(--line); border-radius: 4px; padding: 1px 4px; }
details label { margin-top: 8px; }
</style>
