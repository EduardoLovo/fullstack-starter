"use client";

import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteTask, useUpdateTask } from "@/hooks/use-tasks";
import { formatDueDate, isOverdue } from "@/lib/format";
import { type Task, type TaskStatus, taskStatusLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TaskItem({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const done = task.status === "DONE";
  const overdue = !done && task.dueDate && isOverdue(task.dueDate);

  function changeStatus(status: TaskStatus) {
    updateTask.mutate(
      { id: task.id, status },
      { onError: (error) => toast.error(error.message) },
    );
  }

  function remove() {
    deleteTask.mutate(task.id, {
      onSuccess: () => toast.success("Tarefa excluída"),
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium break-words", done && "text-muted-foreground line-through")}>{task.title}</p>
        {task.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground break-words">{task.description}</p>
        )}
        {task.dueDate && (
          <p
            className={cn(
              "mt-2 inline-flex items-center gap-1 text-xs",
              overdue ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            <CalendarDays className="size-3.5" aria-hidden />
            {overdue ? "Atrasada · " : "Prazo · "}
            {formatDueDate(task.dueDate)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Select value={task.status} onValueChange={(value) => changeStatus(value as TaskStatus)}>
          <SelectTrigger size="sm" className="w-36" aria-label={`Status de "${task.title}"`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(taskStatusLabel).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" onClick={() => onEdit(task)} aria-label={`Editar "${task.title}"`}>
          <Pencil />
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Excluir "${task.title}"`}>
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{task.title}&rdquo; será excluída permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={remove}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
