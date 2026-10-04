import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function Home() {
  const userCount = await prisma.user.count();
  const user = await getSessionUser();
  if (!user) {
    redirect(userCount === 0 ? "/setup" : "/login");
  }
  if (!user.householdId) redirect("/onboarding");
  redirect("/dashboard");
}
