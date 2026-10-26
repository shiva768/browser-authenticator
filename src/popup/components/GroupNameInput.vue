<script setup lang="ts">
import { onMounted, ref } from "vue";

// 毎秒再描画される親の中でも入力が消えないよう、入力中の値は draft で持つ。
// Enter / フォーカスが外れたら確定、Esc で取り消し。いずれも最後に done を出す。
const props = defineProps<{ name: string }>();
const emit = defineEmits<{ rename: [name: string]; done: [] }>();

const draft = ref(props.name);
const el = ref<HTMLInputElement | null>(null);
let finished = false;

onMounted(() => {
  el.value?.focus();
  el.value?.select();
});

function finish(commit: boolean) {
  if (finished) return;
  finished = true;
  if (commit && draft.value.trim() !== props.name) emit("rename", draft.value);
  emit("done");
}
</script>

<template>
  <input
    ref="el"
    v-model="draft"
    class="group-name"
    title="名前を変更 (空にするとグループを解散)"
    @click.stop
    @keydown.enter.stop.prevent="finish(true)"
    @keydown.esc.stop="finish(false)"
    @keydown.stop
    @blur="finish(true)"
  />
</template>

<style scoped>
.group-name { flex: 1; padding: 2px 6px; font-size: 12px; font-weight: 600; }
</style>
