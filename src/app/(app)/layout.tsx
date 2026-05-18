import { Providers } from "@/components/layout/Providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}>
      {children}
    </Providers>
  );
}
