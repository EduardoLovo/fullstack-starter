import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiRequest } from "@/lib/api";
import type { Paginated, Task, TaskStatus } from "@/lib/types";

export type TasksQuery = {
  page: number;
  perPage: number;
  status?: TaskStatus;
  search?: string;
};

export type TaskInput = {
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
};

export function useTasks(query: TasksQuery) {
  return useQuery({
    queryKey: ["tasks", query],
    queryFn: async () => {
      const { data, headers } = await apiRequest<Paginated<Task>>("/tasks", { query });
      // X-Cache vem do plugin de cache da API: mostra na tela se a resposta veio do Redis.
      return { ...data, cache: headers.get("x-cache") as "HIT" | "MISS" | null };
    },
    // Ao trocar de página ou filtro, mantém a lista anterior na tela até a nova chegar.
    placeholderData: keepPreviousData,
  });
}

// Depois de qualquer escrita, descarta as listas guardadas no navegador.
// A API também invalida o cache dela no Redis, então a próxima leitura é fresca.
function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["tasks"] });
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: TaskInput) =>
      // Na criação, campos vazios simplesmente não são enviados.
      api<Task>("/tasks", {
        method: "POST",
        body: {
          title: input.title,
          status: input.status,
          ...(input.description && { description: input.description }),
          ...(input.dueDate && { dueDate: input.dueDate }),
        },
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<TaskInput> & { id: string }) =>
      api<Task>(`/tasks/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
