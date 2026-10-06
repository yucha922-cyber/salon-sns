import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: {
    // Demo mode: no Supabase env, mock AI, no persistence.
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", AI_PROVIDER: "mock", DEMO_SESSION_SECRET: "e2e-secret-e2e-secret" },
  },
});
