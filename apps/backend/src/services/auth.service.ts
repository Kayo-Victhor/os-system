import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { prisma } from "../lib/prisma.js";
import type { LoginInput } from "../schemas/auth.schema.js";

const JWT_SECRET: string = process.env.JWT_SECRET ?? "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não configurado");
}

export async function loginUser(data: LoginInput) {
  const user = await prisma.user.findUnique({
    where: {
      email: data.email
    }
  });

  if (!user) {
    return null;
  }

  const passwordValid = await bcrypt.compare(
    data.password,
    user.password
  );

  if (!passwordValid) {
    return null;
  }

  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    {
      expiresIn: "1h"
    }
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }
  };
}