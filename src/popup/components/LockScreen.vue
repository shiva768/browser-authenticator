<script setup lang="ts">
import { ref } from "vue";
import { unlock } from "../../lib/vault";
import type { Entry } from "../../lib/types";

const emit = defineEmits<{ unlocked: [entries: Entry[]] }>();
const password = ref("");
const error = ref("");
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = "";
  try {
    emit("unlocked", await unlock(password.value));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form @submit.prevent="submit">
    <p class="note">パスワードを入力してロックを解除してください。</p>
    <input v-model="password" type="password" placeholder="パスワード" autofocus required />
    <p v-if="error" class="error">{{ error }}</p>
    <button class="primary" :disabled="busy">{{ busy ? "確認中…" : "ロック解除" }}</button>
  </form>
</template>
