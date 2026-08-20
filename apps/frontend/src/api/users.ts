import { apiRequest } from "./client.ts";
import type { UserRecord, UserRole } from "./types.ts";

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: "USER" | "TECHNICIAN";
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
}

export function listUsers(role?: UserRole) {
  return apiRequest<UserRecord[]>("/users", { query: { role } });
}

export function getUser(id: string) {
  return apiRequest<UserRecord>(`/users/${id}`);
}

export function createUser(data: CreateUserInput) {
  return apiRequest<UserRecord>("/users", { method: "POST", body: data });
}

export function updateUser(id: string, data: UpdateUserInput) {
  return apiRequest<UserRecord>(`/users/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export function deleteUser(id: string) {
  return apiRequest<void>(`/users/${id}`, { method: "DELETE" });
}
