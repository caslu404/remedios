import { redirect } from "next/navigation";
import { TreatmentApp } from "@/features/dashboard/treatment-app";
import { isDemoMode } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const demo = isDemoMode();
  if (!demo) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/login");
  }
  return <TreatmentApp demoMode={demo} />;
}
