import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { JoinForm } from "./join-form";

export const metadata = { title: "پیوستن با کد دعوت" };

export default async function JoinPage() {
  const user = await getSessionUser();
  if (user) redirect("/onboarding");
  return <JoinForm />;
}
