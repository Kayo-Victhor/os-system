import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

import app from "../../src/app.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("remoção definitiva da identidade CUSTOMER legada", () => {
  it("mantém somente as roles internas no enum PostgreSQL", async () => {
    const roles = await testPrisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enum_value."enumlabel"
      FROM pg_type enum_type
      JOIN pg_enum enum_value ON enum_value."enumtypid" = enum_type."oid"
      WHERE enum_type."typname" = 'UserRole'
      ORDER BY enum_value."enumsortorder"
    `;

    expect(roles.map(({ enumlabel }) => enumlabel)).toEqual([
      "ADMIN",
      "ATTENDANT",
      "TECHNICIAN",
    ]);
  });

  it("remove o vínculo Customer.userId e a tabela de verificação antiga", async () => {
    const columns = await testPrisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT "column_name"
      FROM information_schema.columns
      WHERE "table_schema" = 'public'
        AND "table_name" = 'Customer'
        AND "column_name" = 'userId'
    `;
    const verificationTables = await testPrisma.$queryRaw<Array<{ relation: string | null }>>`
      SELECT to_regclass('public."EmailVerificationToken"')::text AS relation
    `;

    expect(columns).toHaveLength(0);
    expect(verificationTables[0]?.relation).toBeNull();
  });

  it("não expõe mais os endpoints de verificação do User legado", async () => {
    const verify = await request(app)
      .post("/auth/verify-email")
      .send({ token: "token-que-nao-deve-ser-processado" });
    const resend = await request(app)
      .post("/auth/resend-verification")
      .send({ email: "cliente@example.com" });

    expect(verify.status).toBe(404);
    expect(resend.status).toBe(404);
  });

  it("rejeita access tokens antigos com role CUSTOMER", async () => {
    const token = jwt.sign(
      { sub: "legacy-customer-user", role: "CUSTOMER" },
      process.env.JWT_ACCESS_SECRET!,
      { algorithm: "HS256", expiresIn: 900 },
    );

    const response = await request(app)
      .get("/customers")
      .set("Cookie", `access_token=${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Sessão inválida ou expirada");
  });
});
