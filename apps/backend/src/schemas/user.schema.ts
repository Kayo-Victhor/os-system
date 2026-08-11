import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["USER", "TECHNICIAN"]).default("USER")
});

export type CreateUserInput = z.infer<typeof createUserSchema>;