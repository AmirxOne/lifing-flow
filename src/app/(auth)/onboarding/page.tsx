import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { OnboardingClient } from "./onboarding-client";

export const metadata = { title: "راه‌اندازی" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.householdId) {
    const count = await prisma.user.count({ where: { householdId: user.householdId } });
    if (count >= 2) redirect("/dashboard"); // household complete — nothing to onboard
  }

  return <OnboardingClient defaultName={user.fullName} />;
}
