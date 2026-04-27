import { Suspense } from "react";
import ResetPasswordView from "../components/ResetPasswordView";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordView />
    </Suspense>
  );
}
