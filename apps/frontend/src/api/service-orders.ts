import { apiRequest } from "./client.ts";
import type {
  ServiceOrder,
  ServiceOrderPriority,
  ServiceOrderStatus,
} from "./types.ts";

export interface ServiceOrderFilters {
  status?: ServiceOrderStatus;
  priority?: ServiceOrderPriority;
  customerId?: string;
  technicianId?: string;
  search?: string;
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

export function listServiceOrders(filters: ServiceOrderFilters = {}) {
  return apiRequest<ServiceOrder[]>("/service-orders", {
    query: { ...filters },
  });
}

export function getServiceOrder(id: string) {
  return apiRequest<ServiceOrder>(`/service-orders/${id}`);
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
