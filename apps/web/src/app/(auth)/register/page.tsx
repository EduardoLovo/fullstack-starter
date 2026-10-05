"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { FormField, fieldProps } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { registerSchema } from "@/lib/schemas";
import { useAuth } from "@/providers/auth-provider";

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: RegisterValues) {
    try {
      await signUp(values.name, values.email, values.password);
      toast.success("Conta criada! Enviamos um e-mail de boas-vindas.");
    } catch (error) {
      form.setError("root", { message: error instanceof Error ? error.message : "Não foi possível cadastrar" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Leva menos de um minuto.</CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent className="grid gap-4">
          <FormField id="name" label="Nome" error={errors.name?.message}>
            <Input autoComplete="name" autoFocus {...fieldProps("name", errors.name?.message)} {...form.register("name")} />
          </FormField>
          <FormField id="email" label="E-mail" error={errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              {...fieldProps("email", errors.email?.message)}
              {...form.register("email")}
            />
          </FormField>
          <FormField id="password" label="Senha" error={errors.password?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              {...fieldProps("password", errors.password?.message)}
              {...form.register("password")}
            />
          </FormField>
          <FormField id="confirmPassword" label="Confirme a senha" error={errors.confirmPassword?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              {...fieldProps("confirmPassword", errors.confirmPassword?.message)}
              {...form.register("confirmPassword")}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres, com letras e números.</p>
          {errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {errors.root.message}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Criando conta..." : "Criar conta"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
