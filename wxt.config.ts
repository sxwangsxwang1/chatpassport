import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "ChatPassport",
    description: "Move AI conversations locally between supported assistants.",
    permissions: ["activeTab", "scripting", "storage", "sidePanel"],
    action: {
      default_title: "Open ChatPassport",
    },
  },
});
