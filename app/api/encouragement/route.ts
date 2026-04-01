import { NextResponse } from "next/server";
import { getUserSupabaseFromRequest } from "@/lib/supabaseUserServer";
import { getOpenAIClient } from "@/lib/openai";

const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

type JobLite = {
  company: string;
  role: string;
  status: string;
  created_at: string;
};

function summarizeJobs(jobs: JobLite[]) {
  const byStatus = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});

  const recent = [...jobs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
    .map((j) => `${j.company} - ${j.role} (${j.status})`);

  return { byStatus, recent, total: jobs.length };
}

export async function POST(req: Request) {
  let supabase: Awaited<ReturnType<typeof getUserSupabaseFromRequest>>["supabase"];
  let user: Awaited<ReturnType<typeof getUserSupabaseFromRequest>>["user"];
  try {
    ({ supabase, user } = await getUserSupabaseFromRequest(req));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const openai = getOpenAIClient();

  const [{ data: jobs, error: jobsError }, { data: backgroundRow }] = await Promise.all([
    supabase.from("jobs").select("company, role, status, created_at"),
    supabase.from("user_background").select("background").eq("user_id", user.id).maybeSingle()
  ]);

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const typedJobs = (jobs || []) as JobLite[];
  const summary = summarizeJobs(typedJobs);
  const background = String(backgroundRow?.background || "").trim();

  const prompt = `You are a witty but supportive career coach.

User data:
- Total applications: ${summary.total}
- Status counts: ${JSON.stringify(summary.byStatus)}
- Recent applications:
${summary.recent.length ? summary.recent.map((r) => `  - ${r}`).join("\n") : "  - none"}
- User background:
${background || "Not provided"}

Task:
Write encouragement that is positive, funny, and practical.
Constraints:
- 5-8 sentences.
- Mention at least 2 concrete observations from their actual status/application data.
- Tailor at least 1 sentence using their background (if available).
- Include exactly 3 actionable next steps as a numbered list (1,2,3) in the same message.
- No emojis.`;

  const response = await openai.responses.create({
    model,
    input: [{ role: "user", content: prompt }],
    temperature: 0.8
  });

  const message = response.output_text?.trim();
  if (!message) {
    return NextResponse.json({ error: "OpenAI returned empty encouragement" }, { status: 500 });
  }

  return NextResponse.json({ message });
}
