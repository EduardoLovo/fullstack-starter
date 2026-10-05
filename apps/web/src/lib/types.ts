// Formatos devolvidos pela API (apps/api). Datas chegam como string ISO.

export type Role = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "BLOCKED";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  avatarUrl: string | null;
  createdAt: string;
};

export type AuthResponse = {
  accessToken: string;
  user: User;
};

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; perPage: number; total: number };
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
};
