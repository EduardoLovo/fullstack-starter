// O prazo é uma data sem horário, gravada como meia-noite UTC. Formatar em UTC
// evita que "10/10" vire "09/10" para quem está no fuso do Brasil (UTC-3).
export function formatDueDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" });
}

export function isOverdue(iso: string) {
  const today = new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10) < today;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
