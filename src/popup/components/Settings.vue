<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getSettings, saveSettings } from "../../lib/vault";

const props = defineProps<{ hasPassword: boolean }>();
const emit = defineEmits<{
  back: [];
  setPassword: [password: string];
  removePassword: [password: string];
  lock: [];
}>();

const pw = ref("");
const pw2 = ref("");
const current = ref("");
const autolock = ref(30);
const error = ref("");
const saved = ref(false);

onMounted(async () => (autolock.value = (await getSettings()).autolockMinutes));

async function updateAutolock() {
  await saveSettings({ autolockMinutes: Math.max(0, Math.floor(autolock.value || 0)) });
  saved.value = true;
  setTimeout(() => (saved.value = false), 1200);
}

function setPw() {
  error.value = "";
  if (pw.value.length < 8) return void (error.value = "8文字以上にしてください");
  if (pw.value !== pw2.value) return void (error.value = "パスワードが一致しません");
  emit("setPassword", pw.value);
  pw.value = pw2.value = "";
}
</script>

<template>
  <div class="panel">
    <h3>セキュリティ</h3>
    <template v-if="!props.hasPassword">
      <p class="note">パスワードを設定すると、アカウント情報が AES-256-GCM で暗号化されます。パスワードを忘れると復元できません。</p>
      <form @submit.prevent="setPw">
        <input v-model="pw" type="password" placeholder="新しいパスワード (8文字以上)" autocomplete="new-password" />
        <input v-model="pw2" type="password" placeholder="パスワード(確認)" autocomplete="new-password" />
        <button class="primary">パスワードを設定</button>
      </form>
    </template>
    <template v-else>
      <button @click="emit('lock')">今すぐロック</button>
      <form @submit.prevent="emit('removePassword', current)">
        <input v-model="current" type="password" placeholder="現在のパスワード" autocomplete="current-password" required />
        <button class="danger">パスワードを解除(平文で保存)</button>
      </form>
      <label>自動ロック(分、0で無効)
        <input v-model.number="autolock" type="number" min="0" @change="updateAutolock" />
      </label>
      <p v-if="saved" class="note">保存しました</p>
    </template>
    <p v-if="error" class="error">{{ error }}</p>
    <button @click="emit('back')">戻る</button>
  </div>
</template>
