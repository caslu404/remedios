import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function authenticatedContext() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

export function unauthorized() {
  return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
}

export function serverError(message: string, details?: unknown) {
  if (details) console.error(message, details);
  return NextResponse.json({ error: message }, { status: 500 });
}
