import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3001,
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
  },
});
