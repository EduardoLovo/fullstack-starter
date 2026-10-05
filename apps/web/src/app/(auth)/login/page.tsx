"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormField, fieldProps } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { loginSchema } from "@/lib/schemas";
import { useAuth } from "@/providers/auth-provider";

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  // Depois do login, o layout (auth) redireciona para a aplicação.
  async function onSubmit(values: LoginValues) {
    try {
      await login(values.email, values.password);
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 429
          ? "Muitas tentativas. Espere um minuto e tente de novo."
          : error instanceof Error
            ? error.message
            : "Não foi possível entrar";
      form.setError("root", { message });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse com seu e-mail e senha.</CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent className="grid gap-4">
          <FormField id="email" label="E-mail" error={errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              {...fieldProps("email", errors.email?.message)}
              {...form.register("email")}
            />
          </FormField>
          <FormField id="password" label="Senha" error={errors.password?.message}>
            <Input
              type="password"
              autoComplete="current-password"
              {...fieldProps("password", errors.password?.message)}
              {...form.register("password")}
            />
          </FormField>
          <Link href="/forgot-password" className="-mt-2 justify-self-end text-sm text-muted-foreground hover:underline">
            Esqueci minha senha
          </Link>
          {errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {errors.root.message}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Não tem conta?{" "}
            <Link href="/register" className="text-foreground underline-offset-4 hover:underline">
              Cadastre-se
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
