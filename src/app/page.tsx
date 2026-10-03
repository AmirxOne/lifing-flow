import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.householdId) redirect("/onboarding");
  redirect("/dashboard");
}
