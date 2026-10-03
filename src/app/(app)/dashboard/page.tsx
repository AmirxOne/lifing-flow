import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { DashboardClient } from "./dashboard-client";

export const metadata = { title: "داشبورد" };

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <DashboardClient />;
}
