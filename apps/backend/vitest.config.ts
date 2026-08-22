import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Unit tests (tests/*.test.ts) mock Prisma per-file — see
    // tests/helpers/prisma-mock.ts — and don't touch a real database.
    // Integration tests (tests/integration/*.test.ts) use the real Prisma
    // client against DATABASE_URL from .env.test (loaded + safety-checked
    // in tests/setup.ts).
    //
    // fileParallelism is disabled because integration tests share ONE
    // real database and call resetDatabase() before each test — if two
    // test files ran concurrently, one file's reset would wipe out
    // fixtures another file is mid-test with. Tests within a single file
    // already run sequentially by default (vitest doesn't parallelize
    // those unless test.concurrent is used, which nothing here does), so
    // this only affects cross-file scheduling. The trade-off is a slower
    // total run in exchange for correctness — acceptable at this suite's
    // size.
    fileParallelism: false,
    env: {
      JWT_ACCESS_SECRET: "test-access-secret-not-for-real-use",
      JWT_REFRESH_SECRET: "test-refresh-secret-not-for-real-use",
      NODE_ENV: "test",
      CORS_ORIGIN: "http://localhost:5173"
    }
  }
});