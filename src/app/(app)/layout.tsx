import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.householdId) redirect("/onboarding");
  return <AppShell>{children}</AppShell>;
}
