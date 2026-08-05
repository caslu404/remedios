import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/features/auth/login-form";
import { isDemoMode } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Entrar" };
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
        <h1>Entre sem senha</h1>
        <p>Enviaremos um link seguro para o seu e-mail. Seus registros ficam vinculados à sua conta.</p>
        <LoginForm />
        <p className="privacy-note">Este app organiza horários e registros. Ele não altera sua prescrição nem substitui orientação profissional.</p>
      </section>
    </main>
  );
}
