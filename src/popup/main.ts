import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { isTabView } from "./mode";

if (isTabView) document.body.classList.add("tab");

createApp(App).mount("#app");
