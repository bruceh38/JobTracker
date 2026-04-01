import { NextResponse } from "next/server";
import { getUserSupabaseFromRequest } from "@/lib/supabaseUserServer";
import { generateAnalysis } from "@/lib/analysis";
import type { JobRow } from "@/lib/types";

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
  const id = String(body.id ?? "").trim();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data: job, error: fetchError } = await supabaseServer
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !job) {
    return NextResponse.json(
      { error: fetchError?.message || "job not found" },
      { status: 404 }
    );
  }

  const typedJob = job as JobRow;
  const { data: backgroundRow } = await supabaseServer
    .from("user_background")
    .select("background")
    .eq("user_id", user.id)
    .maybeSingle();

  let analysis;
  try {
    analysis = await generateAnalysis({
      company: typedJob.company,
      role: typedJob.role,
      jobDescription: typedJob.job_description || "",
      jobUrl: typedJob.job_url,
      userBackground: backgroundRow?.background ?? ""
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate OpenAI analysis"
      },
      { status: 500 }
    );
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("jobs")
    .update({
      analysis,
      analysis_updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ job: updated });
}
