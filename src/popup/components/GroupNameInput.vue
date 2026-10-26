<script setup lang="ts">
import { ref, watch } from "vue";

// 毎秒再描画される親の中でも入力が消えないよう、入力中の値は draft で持つ
const props = defineProps<{ name: string }>();
const emit = defineEmits<{ rename: [name: string] }>();

const draft = ref(props.name);
watch(
  () => props.name,
  (n) => (draft.value = n)
);
</script>

<template>
  <input
    v-model="draft"
    class="group-name"
    title="名前を変更 (空にするとグループを解散)"
    @click.stop
    @keydown.stop
    @change="emit('rename', draft)"
  />
</template>

<style scoped>
.group-name { flex: 1; padding: 2px 6px; font-size: 12px; font-weight: 600; }
</style>
