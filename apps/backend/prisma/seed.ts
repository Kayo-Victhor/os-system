import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashPassword } from "../src/lib/password.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL
});

const prisma = new PrismaClient({
  adapter
});

async function main() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123456";
  const passwordHash = await hashPassword(seedPassword);

  const admin = await prisma.user.upsert({
    where: {
      email: "admin@os-system.local"
    },
    update: {
      role: "ADMIN"
    },
    create: {
      name: "Administrador",
      email: "admin@os-system.local",
      password: passwordHash,
      role: "ADMIN"
    }
  });

  console.log("Admin criado:", admin.email);

  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.warn(
      "Aviso: SEED_ADMIN_PASSWORD não definido, usando senha padrão de desenvolvimento. " +
        "Defina SEED_ADMIN_PASSWORD no .env antes de rodar o seed em qualquer ambiente compartilhado.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });