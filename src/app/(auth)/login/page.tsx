import { redirect } from "next/navigation";

// Sign-in now lives in the auth modal on the landing page.
export default function LoginPage() {
  redirect("/");
}
