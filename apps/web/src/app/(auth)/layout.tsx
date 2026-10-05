"use client";

import { Layers } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { safeRedirect } from "@/lib/safe-redirect";
import { useAuth } from "@/providers/auth-provider";

// Layout das telas públicas (login, cadastro, senha). Quem já está logado
// é mandado direto para a aplicação, exceto na redefinição de senha: o link
// do e-mail precisa funcionar mesmo com uma sessão aberta.
function RedirectIfAuthenticated() {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "authenticated" && pathname !== "/reset-password") {
      router.replace(safeRedirect(searchParams.get("next")));
    }
  }, [status, router, searchParams, pathname]);

  return null;
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <Suspense>
        <RedirectIfAuthenticated />
      </Suspense>
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Layers className="size-6" aria-hidden />
        Fullstack Starter
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
