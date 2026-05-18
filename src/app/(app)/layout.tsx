import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Providers } from "@/components/layout/Providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <Providers supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}>
      {children}
    </Providers>
  );
}
