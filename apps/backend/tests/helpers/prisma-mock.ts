import { vi } from "vitest";

/**
 * A minimal hand-rolled Prisma mock covering only the methods this project
 * actually calls. Each test file resets/configures the relevant methods'
 * return values via mockResolvedValueOnce / mockImplementation as needed.
 *
 * We intentionally avoid a heavier "auto-mock the whole client" library
 * here — the project doesn't already depend on one, and the surface area
 * we call is small enough that hand-writing it is simpler and more
 * transparent than adding a new dependency for it.
 */
export const prismaMock = {
  user: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  customer: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  serviceOrder: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  refreshToken: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

export function resetPrismaMock() {
  for (const model of Object.values(prismaMock)) {
    for (const fn of Object.values(model)) {
      fn.mockReset();
    }
  }
}
