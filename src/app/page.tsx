import { redirect } from "next/navigation";
import { getCurrentUser, hasUsers } from "@/lib/auth";

export default async function HomePage() {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  if (await getCurrentUser()) {
    redirect("/workouts");
  }

  redirect("/login");
}
