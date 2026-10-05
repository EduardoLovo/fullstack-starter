"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";

// Área logada. Sem sessão, manda para o login guardando a página atual
// em ?next= para voltar depois de entrar.
//
// Isso é só experiência de uso: quem protege os dados de verdade é a API,
// que exige o token em toda rota. Esconder uma tela no frontend não é segurança.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <div className="mx-auto grid max-w-5xl gap-4 p-4 pt-20" aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl p-4 pb-16">{children}</main>
    </>
  );
}
