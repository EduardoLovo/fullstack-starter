import type { AuthResponse } from "./types";

// Cliente HTTP da aplicação.
//
// - Access token: fica só em memória (variável abaixo). Não vai para o
//   localStorage, onde qualquer script injetado (XSS) conseguiria ler.
// - Refresh token: cookie httpOnly que o navegador envia sozinho para /api/auth/refresh.
// - Se uma chamada voltar 401, renova o access token uma vez e repete a chamada.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setOnSessionExpired(callback: () => void) {
  onSessionExpired = callback;
}

// Várias chamadas podem receber 401 ao mesmo tempo (ex.: o token expirou com a
// página aberta). Todas esperam a MESMA renovação: como cada refresh token só
// vale uma vez, duas renovações em paralelo derrubariam a sessão. Isso também
// cobre o React em dev, que executa os efeitos duas vezes.
export function refreshSession(): Promise<AuthResponse | null> {
  refreshPromise ??= fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as AuthResponse;
      accessToken = data.accessToken;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

export type ApiResult<T> = { data: T; headers: Headers };

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, query }: RequestOptions = {},
  retry = true,
): Promise<ApiResult<T>> {
  const url = new URL(`${API_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined && { "content-type": "application/json" }),
      ...(accessToken && { authorization: `Bearer ${accessToken}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Token expirado: renova e tenta de novo (uma vez só). Rotas de /auth ficam
  // de fora, senão um login com senha errada tentaria renovar a sessão.
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    const session = await refreshSession();
    if (session) return apiRequest<T>(path, { method, body, query }, false);
    accessToken = null;
    onSessionExpired?.();
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(response.status, error?.message ?? "Erro inesperado, tente novamente");
  }

  const data = response.status === 204 ? (null as T) : ((await response.json()) as T);
  return { data, headers: response.headers };
}

export async function api<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await apiRequest<T>(path, options)).data;
}
