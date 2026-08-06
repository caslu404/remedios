import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/features/auth/login-form";
import { isDemoMode } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Abrindo app" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (isDemoMode()) redirect("/");
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/");
  return (
    <main className="login-shell">
      <section className="login-card">
        <BrandMark />
        <p className="eyebrow">Tratamento Adaptativo</p>
        <h1>Abrindo seu app</h1>
        <p>Este iPhone recebe uma sessão privada automaticamente. Você não precisa informar e-mail nem abrir links.</p>
        <LoginForm />
        <p className="privacy-note">Seus dados ficam vinculados a esta instalação. Não apague os dados do navegador nem remova o app antes de exportar seu histórico.</p>
      </section>
    </main>
  );
}
