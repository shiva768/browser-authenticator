<script setup lang="ts">
import { onMounted, ref } from "vue";
import QRCode from "qrcode";
import { buildOtpauth } from "../../lib/otpauth";
import type { Entry } from "../../lib/types";

const props = defineProps<{ entry: Entry }>();
const emit = defineEmits<{ close: [] }>();

const uri = buildOtpauth(props.entry);
const dataUrl = ref("");
const error = ref("");
const copied = ref(false);

onMounted(async () => {
  try {
    // ダークモードでも読み取れるよう、白背景・黒ドットを固定する
    dataUrl.value = await QRCode.toDataURL(uri, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    error.value = "QRコードを生成できませんでした";
  }
});

async function copyUri() {
  await navigator.clipboard.writeText(uri);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}
</script>

<template>
  <div class="panel">
    <h3>{{ entry.issuer || entry.account }}</h3>
    <p v-if="entry.issuer" class="note" style="margin-top: -8px">{{ entry.account }}</p>
    <img v-if="dataUrl" :src="dataUrl" width="260" height="260" alt="アカウントのQRコード" class="qr" />
    <p v-if="error" class="error">{{ error }}</p>
    <p class="note">
      このQRコードにはシークレットキーが含まれます。他人に見られない場所で使い、スクリーンショットは使用後に削除してください。
    </p>
    <button @click="copyUri">{{ copied ? "コピーしました" : "otpauth:// URL をコピー" }}</button>
    <button @click="emit('close')">閉じる</button>
  </div>
</template>

<style scoped>
.qr { align-self: center; border-radius: 6px; border: 1px solid var(--line); }
h3 { margin: 0; }
</style>
