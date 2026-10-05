import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { bootstrapPrimaryAdmin } from "../src/services/admin-bootstrap.service.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !seedPassword) {
    throw new Error("ADMIN_EMAIL e SEED_ADMIN_PASSWORD precisam estar configurados para executar o seed.");
  }

  await bootstrapPrimaryAdmin(prisma.user, { email: adminEmail, password: seedPassword });

  console.log("Administrador inicial configurado.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
