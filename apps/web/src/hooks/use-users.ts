import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiRequest } from "@/lib/api";
import type { Paginated, Role, User, UserStatus } from "@/lib/types";

export function useUsers(query: { page: number; perPage: number; search?: string }) {
  return useQuery({
    queryKey: ["users", query],
    queryFn: async () => {
      const { data, headers } = await apiRequest<Paginated<User>>("/users", { query });
      return { ...data, cache: headers.get("x-cache") as "HIT" | "MISS" | null };
    },
    placeholderData: keepPreviousData,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; status?: UserStatus }) =>
      api<User>(`/users/${id}`, { method: "PATCH", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
