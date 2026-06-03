import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard/chat-docs?demo=1");
}

