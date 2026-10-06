import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/env";

/** Supabase email-confirmation / magic-link callback. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (getDataMode() === "supabase" && code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  return NextResponse.redirect(new URL("/login?confirmed=1", request.url));
}
