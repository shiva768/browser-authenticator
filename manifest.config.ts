import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "Browser Authenticator",
  version: pkg.version,
  description: "ブラウザ上で2段階認証コード(TOTP/HOTP)を生成します。",
  action: { default_popup: "src/popup/index.html" },
  background: { service_worker: "src/background/service-worker.ts", type: "module" },
  permissions: ["activeTab", "storage", "alarms", "scripting"],
});
