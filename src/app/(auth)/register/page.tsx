import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { RegisterForm } from "./register-form";

export const metadata = { title: "ثبت‌نام" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/onboarding");
  return <RegisterForm />;
}
