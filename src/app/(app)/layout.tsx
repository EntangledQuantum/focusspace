import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Providers } from "@/components/layout/Providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getSession() reads the JWT from the cookie locally — no network call to Supabase auth.
  // The proxy middleware already refreshes the session on every request, so this is safe.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  return (
    <Providers supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}>
      {children}
    </Providers>
  );
}
