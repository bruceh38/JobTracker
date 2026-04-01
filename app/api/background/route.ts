import { NextResponse } from "next/server";
import { getUserSupabaseFromRequest } from "@/lib/supabaseUserServer";

function isMissingBackgroundTableError(error: { code?: string; message: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.message.toLowerCase().includes("user_background");
}

export async function GET(req: Request) {
  let supabaseServer: Awaited<ReturnType<typeof getUserSupabaseFromRequest>>["supabase"];
  let user: Awaited<ReturnType<typeof getUserSupabaseFromRequest>>["user"];
  try {
    ({ supabase: supabaseServer, user } = await getUserSupabaseFromRequest(req));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const { data, error } = await supabaseServer
    .from("user_background")
    .select("background")
    .eq("user_id", user.id)
    .maybeSingle();

  if (isMissingBackgroundTableError(error)) {
    return NextResponse.json({
      background: "",
      warning: "Missing table public.user_background. Run supabase/schema.sql."
    });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ background: data?.background ?? "" });
}

export async function POST(req: Request) {
  let supabaseServer: Awaited<ReturnType<typeof getUserSupabaseFromRequest>>["supabase"];
  let user: Awaited<ReturnType<typeof getUserSupabaseFromRequest>>["user"];
  try {
    ({ supabase: supabaseServer, user } = await getUserSupabaseFromRequest(req));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const background = String(body.background ?? "").trim();

  const { data, error } = await supabaseServer
    .from("user_background")
    .upsert(
      {
        user_id: user.id,
        background,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("background")
    .single();

  if (isMissingBackgroundTableError(error)) {
    return NextResponse.json(
      {
        error:
          "Missing table public.user_background. Please run supabase/schema.sql in Supabase SQL Editor."
      },
      { status: 400 }
    );
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ background: data.background });
}
