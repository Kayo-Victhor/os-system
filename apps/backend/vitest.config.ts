import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Tests run against a mocked Prisma client (see tests/helpers/prisma-mock.ts)
    // rather than a live database, so these secrets never need to match any
    // real environment — they just need to exist so the app modules that
    // require them at import time don't throw.
    env: {
      JWT_ACCESS_SECRET: "test-access-secret-not-for-real-use",
      JWT_REFRESH_SECRET: "test-refresh-secret-not-for-real-use",
      NODE_ENV: "test",
      CORS_ORIGIN: "http://localhost:5173"
    }
  }
});