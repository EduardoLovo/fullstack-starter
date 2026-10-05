import { redirect } from "next/navigation";

// A página inicial é a lista de tarefas. Se não houver sessão,
// o layout da área logada manda para o login.
export default function Home() {
  redirect("/tasks");
}
