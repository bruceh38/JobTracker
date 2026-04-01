import { NextResponse } from "next/server";
import { getUserSupabaseFromRequest } from "@/lib/supabaseUserServer";
import type { JobStatus } from "@/lib/types";

const allowedStatuses: JobStatus[] = [
  "applied",
  "oa",
  "interview",
  "rejected",
  "accepted"
];

export async function GET(req: Request) {
  let supabaseServer: Awaited<ReturnType<typeof getUserSupabaseFromRequest>>["supabase"];
  try {
    ({ supabase: supabaseServer } = await getUserSupabaseFromRequest(req));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const { data, error } = await supabaseServer
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data });
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
  const company = String(body.company ?? "").trim();
  const role = String(body.role ?? "").trim();
  const jobUrl = String(body.jobUrl ?? "").trim();
  const statusRaw = String(body.status ?? "applied").trim().toLowerCase();
  const status = allowedStatuses.includes(statusRaw as JobStatus)
    ? (statusRaw as JobStatus)
    : "applied";

  if (!company || !role) {
    return NextResponse.json(
      { error: "company and role are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("jobs")
    .insert({
      user_id: user.id,
      company,
      role,
      status,
      job_url: jobUrl || null
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ job: data }, { status: 201 });
}

export async function PATCH(req: Request) {
  let supabaseServer: Awaited<ReturnType<typeof getUserSupabaseFromRequest>>["supabase"];
  try {
    ({ supabase: supabaseServer } = await getUserSupabaseFromRequest(req));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 }
    );
  }
  const body = await req.json();
  const id = String(body.id ?? "").trim();
  const statusRaw = String(body.status ?? "").trim().toLowerCase();

  if (!id || !allowedStatuses.includes(statusRaw as JobStatus)) {
    return NextResponse.json(
      { error: "id and valid status are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("jobs")
    .update({ status: statusRaw as JobStatus })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ job: data });
}
