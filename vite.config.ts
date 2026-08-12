import { defineConfig } from "vite";

export default defineConfig(async () => {
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      cloudflare({
        config: {
          name: "server",
          main: "./worker/index.ts",
          compatibility_date: "2026-05-22",
          assets: {
            binding: "ASSETS",
            not_found_handling: "single-page-application",
            run_worker_first: true,
          },
        },
      }),
    ],
    server: {
      host: "127.0.0.1",
      port: 3001,
    },
    preview: {
      host: "127.0.0.1",
      port: 4174,
    },
  };
});
