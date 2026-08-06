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
        <h1>Acesso deste iPhone</h1>
        <p>O login protege seu histórico e suas notificações. Você recebe um link seguro e, na URL oficial, normalmente entra apenas uma vez neste aparelho.</p>
        <LoginForm />
        <p className="privacy-note">Use sempre <strong>remedios-seven.vercel.app</strong>. Links de preview de branches são ambientes separados e podem pedir outro login.</p>
      </section>
    </main>
  );
}
