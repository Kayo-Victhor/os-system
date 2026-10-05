import { customerApiRequest } from "./client.ts";
import type { CustomerAccountProfile, CustomerServiceOrder } from "./types.ts";

export function loginCustomer(email: string, password: string) {
  return customerApiRequest<{ customerAccount: CustomerAccountProfile }>(
    "/auth/customer/login",
    { method: "POST", body: { email, password } },
  );
}

export function logoutCustomer() {
  return customerApiRequest<void>("/auth/customer/logout", { method: "POST" });
}

export function fetchCurrentCustomerAccount() {
  return customerApiRequest<{ customerAccount: CustomerAccountProfile }>(
    "/auth/customer/me",
  );
}

export function listOwnCustomerServiceOrders(signal?: AbortSignal) {
  return customerApiRequest<CustomerServiceOrder[]>("/auth/customer/service-orders", {
    signal,
  });
}

export function getOwnCustomerServiceOrder(id: string, signal?: AbortSignal) {
  return customerApiRequest<CustomerServiceOrder>(`/auth/customer/service-orders/${id}`, {
    signal,
  });
}
