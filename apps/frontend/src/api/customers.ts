import { apiRequest } from "./client.ts";
import type { Customer } from "./types.ts";

export interface CustomerInput {
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  address?: string;
}

export function listCustomers(search?: string, signal?: AbortSignal) {
  return apiRequest<Customer[]>("/customers", { query: { search }, signal });
}

export function getOwnCustomer(signal?: AbortSignal) {
  return apiRequest<Customer>("/customers/me", { signal });
}

export function getCustomer(id: string, signal?: AbortSignal) {
  return apiRequest<Customer>(`/customers/${id}`, { signal });
}

export function createCustomer(data: CustomerInput) {
  return apiRequest<Customer>("/customers", { method: "POST", body: data });
}

export function updateCustomer(id: string, data: Partial<CustomerInput>) {
  return apiRequest<Customer>(`/customers/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export function deleteCustomer(id: string) {
  return apiRequest<void>(`/customers/${id}`, { method: "DELETE" });
}
