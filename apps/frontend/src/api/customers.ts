import { apiRequest } from "./client.ts";
import type { Customer, CustomerAccountStatus } from "./types.ts";

export interface CustomerInput {
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  address?: string;
}

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CustomersPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface PaginatedCustomers {
  items: Customer[];
  pagination: CustomersPagination;
}

export function listCustomers(filters: CustomerFilters = {}, signal?: AbortSignal) {
  return apiRequest<PaginatedCustomers>("/customers", {
    query: {
      search: filters.search,
      page: filters.page?.toString(),
      limit: filters.limit?.toString(),
    },
    signal,
  });
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

export function updateCustomerAccountStatus(
  id: string,
  status: CustomerAccountStatus,
) {
  return apiRequest<{ customerAccount: { status: CustomerAccountStatus } }>(
    `/customers/${id}/account/status`,
    { method: "PATCH", body: { status } },
  );
}

export function deleteCustomerAccount(id: string) {
  return apiRequest<void>(`/customers/${id}/account`, {
    method: "DELETE",
  });
}

export function anonymizeCustomer(id: string) {
  return apiRequest<Customer>(`/customers/${id}/anonymize`, {
    method: "POST",
    body: {},
  });
}
