import { NextResponse } from "next/server";
import { getUserSupabaseFromRequest } from "@/lib/supabaseUserServer";
import type { JobStatus } from "@/lib/types";

const MAX_COMPANY_LEN = 120;
const MAX_ROLE_LEN = 160;
const allowedStatuses: JobStatus[] = [
  "applied",
  "oa",
  "interview",
  "rejected",
  "accepted"
];

function cleanToken(value: string): string {
  return value
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(
      /^\s*(?:company|employer|organization|org|role|position|title|job|公司|单位|职位|岗位)\s*[:：=-]\s*/i,
      ""
    )
    .replace(/^['"([{<\s]+|['")\]}>\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLen: number): string {
  return value.length > maxLen ? value.slice(0, maxLen).trim() : value;
}

function captureLabel(input: string, labels: string[]): string | null {
  const alternation = labels.join("|");
  const regex = new RegExp(`(?:^|[|,;，；｜])\\s*(?:${alternation})\\s*[:：=-]\\s*([^|,;，；｜]+)`, "i");
  const match = input.match(regex);
  return match?.[1] ? cleanToken(match[1]) : null;
}

function scoreRoleLike(value: string): number {
  const roleWords = [
    "engineer",
    "developer",
    "scientist",
    "analyst",
    "manager",
    "intern",
    "architect",
    "designer",
    "consultant",
    "specialist",
    "lead",
    "staff",
    "principal",
    "director",
    "qa",
    "sre",
    "devops",
    "frontend",
    "backend",
    "full stack",
    "ml",
    "ai",
    "data",
    "security",
    "product",
    "research"
    ,
    "工程师",
    "开发",
    "算法",
    "产品",
    "数据",
    "分析",
    "测试",
    "运维",
    "实习"
  ];
  const normalized = value.toLowerCase();
  let score = 0;
  for (const word of roleWords) {
    if (normalized.includes(word)) score += 2;
  }
  if (/\b(i|ii|iii|iv|senior|sr|junior|jr|principal|staff|lead)\b/i.test(value)) score += 2;
  if (/(高级|资深|初级|实习|校招)/.test(value)) score += 2;
  if (/\b(remote|onsite|hybrid|contract|full[- ]?time|part[- ]?time)\b/i.test(value)) score += 1;
  if (value.length > 90) score -= 2;
  return score;
}

function scoreCompanyLike(value: string): number {
  const companyWords = [
    "inc",
    "llc",
    "ltd",
    "corp",
    "corporation",
    "technologies",
    "technology",
    "systems",
    "group",
    "labs",
    "studio",
    "solutions",
    "company",
    "co."
    ,
    "公司",
    "集团",
    "科技",
    "技术",
    "大学",
    "银行",
    "研究院"
  ];
  const normalized = value.toLowerCase();
  let score = 0;
  for (const word of companyWords) {
    if (normalized.includes(word)) score += 2;
  }
  if (/^[A-Z0-9&.,' -]+$/.test(value) && value.length <= 40) score += 1;
  if (/\b(university|college|institute|bank|hospital|health|airlines)\b/i.test(value)) score += 2;
  if (/(大学|学院|银行|医院|航空|集团|科技)/.test(value)) score += 2;
  return score;
}

function finalizePair(companyRaw: string, roleRaw: string): { company: string; role: string } | null {
  const company = truncate(cleanToken(companyRaw), MAX_COMPANY_LEN);
  const role = truncate(cleanToken(roleRaw), MAX_ROLE_LEN);

  if (!company || !role) return null;
  if (company.length < 2 || role.length < 2) return null;
  if (company.toLowerCase() === role.toLowerCase()) return null;

  return { company, role };
}

function splitByFirst(input: string, sep: string): [string, string] | null {
  const idx = input.indexOf(sep);
  if (idx === -1) return null;
  const left = input.slice(0, idx).trim();
  const right = input.slice(idx + sep.length).trim();
  if (!left || !right) return null;
  return [left, right];
}

function parseLine(line: string): { company: string; role: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const obj = JSON.parse(trimmed) as { company?: unknown; role?: unknown };
      if (typeof obj.company === "string" && typeof obj.role === "string") {
        return finalizePair(obj.company, obj.role);
      }
    } catch {
      // Continue with non-JSON parsing.
    }
  }

  const cleaned = cleanToken(trimmed);

  const labeledCompany = captureLabel(cleaned, [
    "company",
    "employer",
    "organization",
    "org",
    "公司",
    "单位"
  ]);
  const labeledRole = captureLabel(cleaned, ["role", "position", "title", "job", "职位", "岗位"]);
  if (labeledCompany && labeledRole) {
    return finalizePair(labeledCompany, labeledRole);
  }

  const directPatterns: Array<{ regex: RegExp; company: number; role: number }> = [
    { regex: /^(.+?)\s+at\s+(.+)$/i, company: 2, role: 1 },
    { regex: /^(.+?)\s*@\s*(.+)$/i, company: 2, role: 1 },
    { regex: /^(.+?)\s+for\s+(.+)$/i, company: 1, role: 2 },
    { regex: /^(.+?)\s+is\s+hiring\s+(.+)$/i, company: 1, role: 2 },
    { regex: /^(.+?)\s+hiring\s+(.+)$/i, company: 1, role: 2 },
    { regex: /^appl(?:y|ying|ied)\s+(?:to\s+)?(.+?)\s+(?:for|as)\s+(.+)$/i, company: 1, role: 2 },
    { regex: /^interview(?:ing)?\s+(?:for\s+)?(.+?)\s+at\s+(.+)$/i, company: 2, role: 1 },
    { regex: /^(.+?)\s*在\s*(.+?)\s*(?:实习|工作|任职)$/i, company: 2, role: 1 },
    { regex: /^(.+?)\s*(?:招聘|招)\s*(.+)$/i, company: 1, role: 2 },
    { regex: /^投递\s*(.+?)\s*(?:的|)\s*(.+)$/i, company: 1, role: 2 }
  ];

  for (const item of directPatterns) {
    const match = cleaned.match(item.regex);
    if (!match) continue;
    const pair = finalizePair(match[item.company], match[item.role]);
    if (pair) return pair;
  }

  const separators = [
    "\t",
    "::",
    "=>",
    "->",
    "|",
    "｜",
    ";",
    "；",
    " / ",
    " - ",
    " — ",
    " – ",
    ":",
    "：",
    ",",
    "，"
  ];
  for (const separator of separators) {
    const split = splitByFirst(cleaned, separator);
    if (!split) continue;

    const [left, right] = split;
    const leftRoleScore = scoreRoleLike(left);
    const rightRoleScore = scoreRoleLike(right);
    const leftCompanyScore = scoreCompanyLike(left);
    const rightCompanyScore = scoreCompanyLike(right);

    if (leftCompanyScore + rightRoleScore >= rightCompanyScore + leftRoleScore) {
      const pair = finalizePair(left, right);
      if (pair) return pair;
    } else {
      const pair = finalizePair(right, left);
      if (pair) return pair;
    }
  }

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length >= 4) {
    for (let i = 1; i < words.length - 1; i++) {
      const left = words.slice(0, i).join(" ");
      const right = words.slice(i).join(" ");

      const leftRoleScore = scoreRoleLike(left);
      const rightRoleScore = scoreRoleLike(right);
      const leftCompanyScore = scoreCompanyLike(left);
      const rightCompanyScore = scoreCompanyLike(right);
      const confidence = Math.abs(
        leftCompanyScore + rightRoleScore - (rightCompanyScore + leftRoleScore)
      );
      if (confidence < 3) continue;

      if (leftCompanyScore + rightRoleScore > rightCompanyScore + leftRoleScore) {
        const pair = finalizePair(left, right);
        if (pair) return pair;
      } else {
        const pair = finalizePair(right, left);
        if (pair) return pair;
      }
    }
  }

  return null;
}

function parseDateHeading(line: string): string | null {
  const trimmed = line.trim().replace(/:$/, "");
  if (!trimmed) return null;

  function isValidYmd(year: number, month: number, day: number): boolean {
    const dt = new Date(Date.UTC(year, month - 1, day));
    return (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    );
  }

  const md = trimmed.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (md) {
    const year = new Date().getFullYear();
    const month = Number(md[1]);
    const day = Number(md[2]);
    if (isValidYmd(year, month, day)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const ymd = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (year >= 2000 && year <= 2100 && isValidYmd(year, month, day)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const mdZh = trimmed.match(/^(\d{1,2})月(\d{1,2})[日号]?$/);
  if (mdZh) {
    const year = new Date().getFullYear();
    const month = Number(mdZh[1]);
    const day = Number(mdZh[2]);
    if (isValidYmd(year, month, day)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const ymdZh = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})[日号]?$/);
  if (ymdZh) {
    const year = Number(ymdZh[1]);
    const month = Number(ymdZh[2]);
    const day = Number(ymdZh[3]);
    if (year >= 2000 && year <= 2100 && isValidYmd(year, month, day)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
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
  const text = String(body.text ?? "");
  const statusRaw = String(body.status ?? "applied").trim().toLowerCase();
  const status = allowedStatuses.includes(statusRaw as JobStatus)
    ? (statusRaw as JobStatus)
    : "applied";

  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const lines = text.split(/\r?\n/);
  const rows: Array<{
    user_id: string;
    company: string;
    role: string;
    status: JobStatus;
    created_at?: string;
  }> = [];
  const skipped: Array<{ line: number; value: string }> = [];
  let activeDate: string | null = null;

  lines.forEach((line, idx) => {
    const headingDate = parseDateHeading(line);
    if (headingDate) {
      activeDate = headingDate;
      return;
    }

    const parsed = parseLine(line);
    if (!parsed) {
      if (line.trim()) {
        skipped.push({ line: idx + 1, value: line.trim() });
      }
      return;
    }

    rows.push({
      user_id: user.id,
      company: parsed.company,
      role: parsed.role,
      status,
      created_at: activeDate ? `${activeDate}T12:00:00.000Z` : undefined
    });
  });

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No valid lines found. Use one line per entry in formats like 'Company, Role', 'Role at Company', or 'company=...; role=...'.",
        skipped
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer.from("jobs").insert(rows).select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    jobs: data,
    insertedCount: data.length,
    skippedCount: skipped.length,
    skipped
  });
}
