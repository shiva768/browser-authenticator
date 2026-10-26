import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "Browser Authenticator",
  version: pkg.version,
  description: "ブラウザ上で2段階認証コード(TOTP/HOTP)を生成します。",
  icons: {
    16: "src/assets/icons/icon-16.png",
    32: "src/assets/icons/icon-32.png",
    48: "src/assets/icons/icon-48.png",
    128: "src/assets/icons/icon-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: { 16: "src/assets/icons/icon-16.png", 32: "src/assets/icons/icon-32.png" },
  },
  background: { service_worker: "src/background/service-worker.ts", type: "module" },
  permissions: ["activeTab", "storage", "alarms", "scripting"],
});
