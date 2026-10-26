import { onBeforeUnmount, onMounted, ref } from "vue";

/** 毎秒更新される現在時刻(ms)。TOTP のカウントダウン用。 */
export function useNow() {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval>;
  onMounted(() => {
    timer = setInterval(() => (now.value = Date.now()), 1000);
  });
  onBeforeUnmount(() => clearInterval(timer));
  return now;
}
