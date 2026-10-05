"use client";

import { ClipboardList, Plus, Search, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskItem } from "@/components/tasks/task-item";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTasks } from "@/hooks/use-tasks";
import { type Task, type TaskStatus, taskStatusLabel } from "@/lib/types";

const PER_PAGE = 10;

export default function TasksPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<TaskStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>();

  const { data, isPending, isError, error, isPlaceholderData } = useTasks({
    page,
    perPage: PER_PAGE,
    status: status === "ALL" ? undefined : status,
    search: debouncedSearch || undefined,
  });

  const filtering = status !== "ALL" || debouncedSearch !== "";

  // Excluiu o último item da última página: volta para a página anterior.
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / PER_PAGE)) : 1;
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setDialogOpen(true);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Minhas tarefas</h1>
          {data && (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              {data.meta.total} {data.meta.total === 1 ? "tarefa" : "tarefas"}
              {data.cache && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                  title="Header X-Cache da API: HIT = resposta veio do Redis, MISS = consultou o PostgreSQL"
                >
                  <Zap className="size-3" aria-hidden />
                  {data.cache === "HIT" ? "Redis (cache)" : "PostgreSQL"}
                </span>
              )}
            </p>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus aria-hidden /> Nova tarefa
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            placeholder="Buscar por título ou descrição"
            aria-label="Buscar tarefas"
            className="pl-8"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as TaskStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            {Object.entries(taskStatusLabel).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
          Não foi possível carregar as tarefas: {error.message}
        </p>
      ) : data.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <ClipboardList className="size-10 text-muted-foreground" aria-hidden />
          <p className="font-medium">{filtering ? "Nenhuma tarefa encontrada" : "Nenhuma tarefa ainda"}</p>
          <p className="text-sm text-muted-foreground">
            {filtering ? "Tente outra busca ou outro status." : "Crie a primeira para começar."}
          </p>
          {!filtering && (
            <Button variant="outline" onClick={openCreate}>
              <Plus aria-hidden /> Nova tarefa
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className={isPlaceholderData ? "grid gap-2 opacity-60" : "grid gap-2"}>
            {data.data.map((task) => (
              <TaskItem key={task.id} task={task} onEdit={openEdit} />
            ))}
          </ul>
          <Pagination page={page} perPage={PER_PAGE} total={data.meta.total} onPageChange={setPage} />
        </>
      )}

      <TaskFormDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editing} />
    </div>
  );
}
