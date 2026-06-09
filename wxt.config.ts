import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Natural Translator",
    description: "Translate selected text, hear pronunciation, and ask follow-up questions.",
    permissions: ["storage", "contextMenus", "scripting", "activeTab"],
    host_permissions: ["https://api.openai.com/*"],
    action: {
      default_title: "Natural Translator",
    },
  },
});
