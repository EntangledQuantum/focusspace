import { redirect } from "next/navigation";

// Account creation now lives in the auth modal on the landing page.
export default function SignupPage() {
  redirect("/");
}
