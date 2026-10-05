"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { FormField, fieldProps } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/schemas";
import { useAuth } from "@/providers/auth-provider";

type ResetValues = z.infer<typeof resetPasswordSchema>;

function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const { status, logout } = useAuth();
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ResetValues) {
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password: values.password } });
      // A API derrubou todas as sessões: se havia uma aberta nesta aba, encerra também.
      if (status === "authenticated") await logout();
      toast.success("Senha alterada! Entre com a nova senha.");
      router.replace("/login");
    } catch (error) {
      form.setError("root", { message: error instanceof Error ? error.message : "Não foi possível alterar a senha" });
    }
  }

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link inválido</CardTitle>
          <CardDescription>Este link está incompleto. Peça um novo na tela de recuperação de senha.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" asChild>
            <Link href="/forgot-password">Pedir novo link</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar nova senha</CardTitle>
        <CardDescription>Depois de alterar, todas as sessões abertas serão encerradas.</CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent className="grid gap-4">
          <FormField id="password" label="Nova senha" error={errors.password?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              autoFocus
              {...fieldProps("password", errors.password?.message)}
              {...form.register("password")}
            />
          </FormField>
          <FormField id="confirmPassword" label="Confirme a nova senha" error={errors.confirmPassword?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              {...fieldProps("confirmPassword", errors.confirmPassword?.message)}
              {...form.register("confirmPassword")}
            />
          </FormField>
          {errors.root && (
            <div role="alert" className="text-sm text-destructive">
              {errors.root.message}{" "}
              <Link href="/forgot-password" className="underline">
                Pedir novo link
              </Link>
            </div>
          )}
        </CardContent>
        <CardFooter className="mt-6">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar nova senha"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// useSearchParams precisa de um <Suspense> em volta no App Router.
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
