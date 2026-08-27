import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashPassword } from "../src/lib/password.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD precisa estar configurado para executar o seed.",
    );
  }

  const passwordHash = await hashPassword(seedPassword);

  const admin = await prisma.user.upsert({
    where: {
      email: "admin@os-system.local",
    },
    update: {
      role: "ADMIN",
      password: passwordHash,
    },
    create: {
      name: "Administrador",
      email: "admin@os-system.local",
      password: passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Admin criado:", admin.email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
