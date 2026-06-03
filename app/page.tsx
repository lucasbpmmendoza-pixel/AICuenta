import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard?demo=1");
}

