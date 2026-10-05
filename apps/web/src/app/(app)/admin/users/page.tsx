"use client";

import { Search, ShieldAlert, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUpdateUser, useUsers } from "@/hooks/use-users";
import { formatDate } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

const PER_PAGE = 20;

function UserRow({ user, isSelf }: { user: User; isSelf: boolean }) {
  const updateUser = useUpdateUser();
  const blocked = user.status === "BLOCKED";

  function update(changes: { role?: Role; status?: User["status"] }, message: string) {
    updateUser.mutate(
      { id: user.id, ...changes },
      { onSuccess: () => toast.success(message), onError: (error) => toast.error(error.message) },
    );
  }

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">
          {user.name} {isSelf && <span className="text-xs font-normal text-muted-foreground">(você)</span>}
        </p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </TableCell>
      <TableCell>
        {/* A API também recusa alterar a si mesmo; aqui só evitamos o clique. */}
        <Select
          value={user.role}
          disabled={isSelf || updateUser.isPending}
          onValueChange={(role) => update({ role: role as Role }, `${user.name} agora é ${role === "ADMIN" ? "admin" : "usuário"}`)}
        >
          <SelectTrigger size="sm" className="w-28" aria-label={`Perfil de ${user.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USER">Usuário</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge variant={blocked ? "destructive" : "secondary"}>{blocked ? "Bloqueado" : "Ativo"}</Badge>
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatDate(user.createdAt)}</TableCell>
      <TableCell className="text-right">
        <Button
          variant={blocked ? "outline" : "destructive"}
          size="sm"
          disabled={isSelf || updateUser.isPending}
          onClick={() =>
            update(
              { status: blocked ? "ACTIVE" : "BLOCKED" },
              blocked ? `${user.name} foi desbloqueado` : `${user.name} foi bloqueado e desconectado`,
            )
          }
        >
          {blocked ? "Desbloquear" : "Bloquear"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const isAdmin = me?.role === "ADMIN";

  const { data, isPending, isError, error, isPlaceholderData } = useUsers({
    page,
    perPage: PER_PAGE,
    search: debouncedSearch || undefined,
  });

  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / PER_PAGE)) : 1;
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  // Usuário comum que digitou a URL: a API responderia 403 de qualquer forma.
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
        <p className="font-medium">Acesso restrito a administradores</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="pt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        {data && (
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {data.meta.total} {data.meta.total === 1 ? "usuário" : "usuários"}
            {data.cache && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                <Zap className="size-3" aria-hidden />
                {data.cache === "HIT" ? "Redis (cache)" : "PostgreSQL"}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar usuários"
          className="pl-8"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
          Não foi possível carregar os usuários: {error.message}
        </p>
      ) : (
        <>
          <div className={isPlaceholderData ? "rounded-lg border opacity-60" : "rounded-lg border"}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Cadastro</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.data.map((user) => <UserRow key={user.id} user={user} isSelf={user.id === me.id} />)
                )}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} perPage={PER_PAGE} total={data.meta.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
