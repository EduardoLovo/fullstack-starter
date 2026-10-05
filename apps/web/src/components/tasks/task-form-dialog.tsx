"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField, fieldProps } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTask, useUpdateTask } from "@/hooks/use-tasks";
import { taskFormSchema, type TaskFormValues } from "@/lib/schemas";
import { type Task, taskStatusLabel } from "@/lib/types";

const emptyValues: TaskFormValues = { title: "", description: "", status: "TODO", dueDate: "" };

function toFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    dueDate: task.dueDate?.slice(0, 10) ?? "",
  };
}

// Mesmo formulário para criar (task = undefined) e editar.
export function TaskFormDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
}) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const form = useForm<TaskFormValues>({ resolver: zodResolver(taskFormSchema), defaultValues: emptyValues });
  const { errors, isSubmitting } = form.formState;

  // Preenche o formulário toda vez que o diálogo abre.
  useEffect(() => {
    if (open) form.reset(task ? toFormValues(task) : emptyValues);
  }, [open, task, form]);

  async function onSubmit(values: TaskFormValues) {
    const input = {
      title: values.title,
      status: values.status,
      description: values.description || null,
      dueDate: values.dueDate || null,
    };
    try {
      if (task) {
        await updateTask.mutateAsync({ id: task.id, ...input });
        toast.success("Tarefa atualizada");
      } else {
        await createTask.mutateAsync(input);
        toast.success("Tarefa criada");
      }
      onOpenChange(false);
    } catch (error) {
      form.setError("root", { message: error instanceof Error ? error.message : "Não foi possível salvar" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>{task ? "Altere os campos e salve." : "Preencha o que precisa ser feito."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <FormField id="title" label="Título" error={errors.title?.message}>
            <Input autoFocus {...fieldProps("title", errors.title?.message)} {...form.register("title")} />
          </FormField>
          <FormField id="description" label="Descrição (opcional)" error={errors.description?.message}>
            <Textarea
              rows={3}
              {...fieldProps("description", errors.description?.message)}
              {...form.register("description")}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="status" label="Status">
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status" className="w-full">
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
                )}
              />
            </FormField>
            <FormField id="dueDate" label="Prazo (opcional)">
              <Input type="date" id="dueDate" {...form.register("dueDate")} />
            </FormField>
          </div>
          {errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {errors.root.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
