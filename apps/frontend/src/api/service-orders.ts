import { apiRequest } from "./client.ts";
import type {
  ServiceOrder,
  ServiceOrderPriority,
  ServiceOrderStatus,
  ServiceOrderTechnician,
  ServiceOrderEvent,
} from "./types.ts";

export interface ServiceOrderFilters {
  page?: number;
  limit?: number;
  status?: ServiceOrderStatus;
  priority?: ServiceOrderPriority;
  customerId?: string;
  technicianId?: string;
  search?: string;
}

export interface ServiceOrdersPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface PaginatedServiceOrders {
  items: ServiceOrder[];
  pagination: ServiceOrdersPagination;
}

export interface CreateServiceOrderInput {
  title: string;
  description: string;
  priority: ServiceOrderPriority;
  customerId: string;
}

export interface UpdateServiceOrderInput {
  title?: string;
  description?: string;
  priority?: ServiceOrderPriority;
}

export function listServiceOrders(filters: ServiceOrderFilters = {}, signal?: AbortSignal) {
  return apiRequest<PaginatedServiceOrders>("/service-orders", {
    query: {
      ...filters,
      page: filters.page?.toString(),
      limit: filters.limit?.toString(),
    },
    signal,
  });
}

export async function listAllServiceOrders(
  filters: Omit<ServiceOrderFilters, "page" | "limit"> = {},
  signal?: AbortSignal,
) {
  const firstPage = await listServiceOrders({ ...filters, page: 1, limit: 100 }, signal);
  if (firstPage.pagination.totalPages <= 1) return firstPage.items;

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.pagination.totalPages - 1 }, (_, index) => (
      listServiceOrders({ ...filters, page: index + 2, limit: 100 }, signal)
    )),
  );
  return [...firstPage.items, ...remainingPages.flatMap((page) => page.items)];
}

export function getServiceOrder(id: string, signal?: AbortSignal) {
  return apiRequest<ServiceOrder>(`/service-orders/${id}`, { signal });
}

export function listServiceOrderEvents(id: string, signal?: AbortSignal) {
  return apiRequest<ServiceOrderEvent[]>(`/service-orders/${id}/events`, { signal });
}

export function listAssignableTechnicians(signal?: AbortSignal) {
  return apiRequest<ServiceOrderTechnician[]>("/service-orders/technicians", {
    signal,
  });
}

export function createServiceOrder(data: CreateServiceOrderInput) {
  return apiRequest<ServiceOrder>("/service-orders", {
    method: "POST",
    body: data,
  });
}

export function updateServiceOrder(id: string, data: UpdateServiceOrderInput) {
  return apiRequest<ServiceOrder>(`/service-orders/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export function deleteServiceOrder(id: string) {
  return apiRequest<void>(`/service-orders/${id}`, { method: "DELETE" });
}

export function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus,
) {
  return apiRequest<ServiceOrder>(`/service-orders/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export function assignTechnician(id: string, technicianId: string | null) {
  return apiRequest<ServiceOrder>(`/service-orders/${id}/technician`, {
    method: "PATCH",
    body: { technicianId },
  });
}
