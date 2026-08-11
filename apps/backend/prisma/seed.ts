import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL
});

const prisma = new PrismaClient({
  adapter
});

async function main() {
  const passwordHash = await bcrypt.hash("admin123456", 10);

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
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });