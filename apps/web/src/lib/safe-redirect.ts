// Para onde ir depois do login (?next=/tasks). Só aceita caminhos internos:
// "//site-malicioso.com" ou "https://..." viraria um redirecionamento aberto,
// usado em golpes de phishing ("faça login no site real e caia no falso").
export function safeRedirect(next: string | null, fallback = "/tasks") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
