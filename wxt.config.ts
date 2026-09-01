import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "ChatPassport",
    description: "Move AI conversations locally between supported assistants.",
    permissions: ["scripting", "storage", "sidePanel"],
    host_permissions: [
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*",
      "https://chat.deepseek.com/*",
    ],
    action: {
      default_title: "Open ChatPassport",
    },
  },
});
