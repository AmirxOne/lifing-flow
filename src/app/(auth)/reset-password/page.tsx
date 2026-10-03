import { Suspense } from "react";
import { ResetForm } from "./reset-form";

export const metadata = { title: "بازیابی رمز عبور" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-paper-soft"><div className="skeleton h-10 w-40" /></div>}>
      <ResetForm />
    </Suspense>
  );
}
