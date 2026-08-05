"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    setMessage(error ? "Não foi possível enviar o link. Tente novamente." : "Link enviado. Confira sua caixa de entrada.");
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="email">E-mail</label>
      <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="lucas@exemplo.com" />
      <button className="primary-button" type="submit" disabled={sending}>{sending ? "Enviando…" : "Enviar link mágico"}</button>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  );
}
