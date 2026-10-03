import { Suspense } from "react";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "فراموشی رمز عبور" };

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-paper-soft"><div className="skeleton h-10 w-40" /></div>}>
      <ForgotForm />
    </Suspense>
  );
}
