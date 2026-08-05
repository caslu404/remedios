import type { SupabaseClient } from "@supabase/supabase-js";

export async function withinRateLimit(supabase: SupabaseClient, route: string, limit: number, windowSeconds: number) {
  const { data, error } = await supabase.rpc("check_rate_limit", { p_route: route, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw error;
  return data === true;
}
