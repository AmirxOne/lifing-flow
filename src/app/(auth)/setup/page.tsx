import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { SetupForm } from "./setup-form";

export const metadata = { title: "راه‌اندازی لایف‌هاب" };

export default async function SetupPage() {
  // First-run only: once any user exists, /setup is dead forever.
  const userCount = await prisma.user.count();
  if (userCount > 0) redirect("/join");

  const user = await getSessionUser();
  if (user) redirect("/onboarding");

  return <SetupForm />;
}
