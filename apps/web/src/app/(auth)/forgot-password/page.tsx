"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormField, fieldProps } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/schemas";

type ForgotValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ForgotValues) {
    try {
      await api("/auth/forgot-password", { method: "POST", body: values });
      setSentTo(values.email);
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 429
          ? "Muitos pedidos seguidos. Espere um minuto."
          : "Não foi possível enviar agora, tente de novo.";
      form.setError("root", { message });
    }
  }

  // A mensagem é a mesma exista o e-mail ou não (a API também não revela).
  if (sentTo) {
    return (
      <Card>
        <CardHeader>
          <MailCheck className="mb-2 size-8 text-muted-foreground" aria-hidden />
          <CardTitle>Verifique seu e-mail</CardTitle>
          <CardDescription>
            Se <strong className="text-foreground">{sentTo}</strong> estiver cadastrado, você vai receber um link para
            criar uma nova senha. O link vale por 30 minutos.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/login">Voltar para o login</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Esqueci minha senha</CardTitle>
        <CardDescription>Informe seu e-mail e enviaremos um link para criar uma nova senha.</CardDescription>
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
          {errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {errors.root.message}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar link"}
          </Button>
          <Link href="/login" className="text-sm text-muted-foreground hover:underline">
            Voltar para o login
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
