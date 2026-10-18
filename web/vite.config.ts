import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, "..", ""), ...process.env };
  const api = `http://127.0.0.1:${env.REHEARSAL_API_PORT || "8780"}`;
  return {
    plugins: [react()],
    server: {
      port: Number(env.REHEARSAL_WEB_PORT || 5180),
      strictPort: true,
      proxy: {
        "/api": api,
        "/exports-service": api,
      },
    },
  };
});
