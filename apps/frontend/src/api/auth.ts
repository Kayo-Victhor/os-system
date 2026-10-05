import { apiRequest, customerApiRequest } from "./client.ts";
import type { AuthUser } from "./types.ts";

export interface RegisterCustomerInput { name: string; email: string; password: string; phone?: string; document?: string; address?: string; }

export function registerCustomer(data: RegisterCustomerInput) {
  return apiRequest<{ message: string }>("/auth/customer/register", { method: "POST", body: data });
}

export function resendCustomerRegistration(email: string) {
  return apiRequest<{ message: string }>("/auth/customer/register/resend", {
    method: "POST",
    body: { email },
  });
}

export function confirmCustomerRegistration(token: string) {
  return apiRequest<{ message: string }>("/auth/customer/register/confirm", {
    method: "POST",
    body: { token },
  });
}

export function login(email: string, password: string) {

  return apiRequest<{ user: AuthUser }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function verifyEmail(token: string) {
  return apiRequest<{ message: string }>("/auth/verify-email", { method: "POST", body: { token } });
}

export function resendEmailVerification(email: string) {
  return apiRequest<{ message: string }>("/auth/resend-verification", { method: "POST", body: { email } });
}

export function requestPasswordReset(email: string) {
  return apiRequest<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email } });
}

export function resetPassword(token: string, password: string, passwordConfirmation: string) {
  return apiRequest<{ message: string }>("/auth/reset-password", { method: "POST", body: { token, password, passwordConfirmation } });
}

export function requestCustomerAccountPasswordReset(email: string) {
  return customerApiRequest<{ message: string }>("/auth/customer/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export function resetCustomerAccountPassword(token: string, password: string) {
  return customerApiRequest<{ message: string }>("/auth/customer/reset-password", {
    method: "POST",
    body: { token, password },
  });
}

export function fetchCurrentUser() {
  return apiRequest<{ user: AuthUser }>("/auth/me");
}
