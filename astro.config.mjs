import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://blog.nickalphawhite.top",
  devToolbar: { enabled: false },
  server: { port: 3000 },
  build: {
    assets: "assets",
  },
});
