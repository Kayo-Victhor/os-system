import { z } from "zod";
import { passwordSchema } from "./user.schema.js";
import { normalizeEmail } from "../lib/email.js";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const customerLoginSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.string().email()),
  password: z.string().min(1).max(128),
});

export const resendCustomerRegistrationSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.string().email()),
});

export const confirmCustomerRegistrationSchema = z.object({
  token: z.string().min(40).max(256),
});

export const forgotPasswordSchema = z.object({ email: z.string().email() });

export const forgotCustomerAccountPasswordSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.string().email()),
});

export const resetCustomerAccountPasswordSchema = z.object({
  token: z.string().min(40).max(256),
  password: passwordSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(40).max(256),
  password: passwordSchema,
  passwordConfirmation: z.string(),
}).refine((data) => data.password === data.passwordConfirmation, {
  message: "As senhas não coincidem",
  path: ["passwordConfirmation"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;
