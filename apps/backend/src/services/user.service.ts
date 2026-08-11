import { prisma } from "../lib/prisma.js";

interface CreateUserData {
  name: string;
  email: string;
  password: string;
}

export async function createUser(data: CreateUserData) {
  return prisma.user.create({
    data
  });
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: {
      createdAt: "desc"
    }
  });
}