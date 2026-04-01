"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JobRow, JobStatus } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type CreateJobForm = {
  combinedText: string;
  company: string;
  role: string;
  status: JobStatus;
  jobUrl: string;
};

const JOB_STATUSES: JobStatus[] = ["applied", "oa", "interview", "rejected", "accepted"];

const initialForm: CreateJobForm = {
  combinedText: "",
  company: "",
  role: "",
  status: "applied",
  jobUrl: ""
};

function parseCompanyRole(input: string): { company: string; role: string } | null {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/https?:\/\//i.test(text)) return null;

  const clean = sanitizeToken(text);
  if (!clean) return null;

  const labeledCompany = captureLabel(clean, [
    "company",
    "employer",
    "organization",
    "org",
    "公司",
    "单位"
  ]);
  const labeledRole = captureLabel(clean, ["role", "position", "title", "job", "职位", "岗位"]);
  if (labeledCompany && labeledRole) {
    return { company: labeledCompany, role: labeledRole };
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
    const match = clean.match(item.regex);
    if (!match) continue;
    const company = sanitizeToken(match[item.company]);
    const role = sanitizeToken(match[item.role]);
    if (company && role) {
      return { company, role };
    }
  }

  const delimiters = [
    "::",
    "=>",
    "->",
    "|",
    "｜",
    " / ",
    " - ",
    " — ",
    " – ",
    ":",
    "：",
    ";",
    "；",
    ",",
    "，"
  ];
  for (const delimiter of delimiters) {
    const parts = splitByDelimiter(clean, delimiter);
    if (parts.length !== 2) continue;
    const left = sanitizeToken(parts[0]);
    const right = sanitizeToken(parts[1]);
    if (!left || !right) continue;

    const leftRoleScore = scoreRoleLike(left);
    const rightRoleScore = scoreRoleLike(right);
    const leftCompanyScore = scoreCompanyLike(left);
    const rightCompanyScore = scoreCompanyLike(right);

    if (leftCompanyScore + rightRoleScore >= rightCompanyScore + leftRoleScore) {
      return { company: left, role: right };
    }
    return { company: right, role: left };
  }

  const words = clean.split(" ").filter(Boolean);
  if (words.length >= 4) {
    for (let i = 1; i < words.length - 1; i++) {
      const left = sanitizeToken(words.slice(0, i).join(" "));
      const right = sanitizeToken(words.slice(i).join(" "));
      if (!left || !right) continue;
      const leftRoleScore = scoreRoleLike(left);
      const rightRoleScore = scoreRoleLike(right);
      const leftCompanyScore = scoreCompanyLike(left);
      const rightCompanyScore = scoreCompanyLike(right);
      const confidence = Math.abs(
        leftCompanyScore + rightRoleScore - (rightCompanyScore + leftRoleScore)
      );
      if (confidence < 3) continue;
      if (leftCompanyScore + rightRoleScore > rightCompanyScore + leftRoleScore) {
        return { company: left, role: right };
      }
      return { company: right, role: left };
    }
  }

  return null;
}

function sanitizeToken(value: string): string {
  return value.replace(/^["'([{<\s]+|["')\]}>.,\s]+$/g, "").replace(/\s+/g, " ").trim();
}

function captureLabel(input: string, labels: string[]): string | null {
  const alternation = labels.join("|");
  const regex = new RegExp(`(?:^|[|,;，；｜])\\s*(?:${alternation})\\s*[:：=-]\\s*([^|,;，；｜]+)`, "i");
  const match = input.match(regex);
  return match?.[1] ? sanitizeToken(match[1]) : null;
}

function splitByDelimiter(input: string, delimiter: string): string[] {
  return input.split(delimiter).map((part) => part.trim()).filter(Boolean);
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
    "officer",
    "administrator",
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
    "research",
    "applied scientist"
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
  if (value.length > 80) score -= 2;
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

function formatStatus(status: JobStatus): string {
  if (status === "oa") return "OA";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type DailyPoint = { date: string; count: number };

function buildDailyPoints(rows: JobRow[]): DailyPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.created_at.slice(0, 10);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function isInternshipRole(role: string): boolean {
  return /(intern|internship|实习)/i.test(role);
}

function mapAuthErrorMessage(message?: string) {
  const msg = (message || "").toLowerCase();
  if (
    msg.includes("anonymous") ||
    msg.includes("signup disabled") ||
    msg.includes("422") ||
    msg.includes("unprocessable")
  ) {
    return "Anonymous auth is disabled in Supabase. Enable it in Supabase Dashboard -> Authentication -> Providers -> Anonymous.";
  }
  return message || "Authentication failed";
}

export default function JobTracker() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [form, setForm] = useState<CreateJobForm>(initialForm);
  const [background, setBackground] = useState("");
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [encouragementOpen, setEncouragementOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [bulkStatus, setBulkStatus] = useState<JobStatus>("applied");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | JobStatus>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [loading, setLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [encouraging, setEncouraging] = useState(false);
  const [encouragement, setEncouragement] = useState("");
  const [savingBackground, setSavingBackground] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState<string>("");

  const apiFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const sessionResult = await supabaseBrowser.auth.getSession();
    let token = sessionResult.data.session?.access_token;

    if (!token) {
      const signInResult = await supabaseBrowser.auth.signInAnonymously();
      if (signInResult.error || !signInResult.data.session?.access_token) {
        throw new Error(mapAuthErrorMessage(signInResult.error?.message));
      }
      token = signInResult.data.session.access_token;
    }

    const headers = new Headers(init?.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(input, { ...init, headers });
  }, []);

  const loadJobs = useCallback(async () => {
    if (!authReady) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/jobs", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load jobs");
      setJobs(payload.jobs || []);
      if (!selectedId && payload.jobs?.length) {
        setSelectedId(payload.jobs[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, authReady, selectedId]);

  useEffect(() => {
    async function ensureAuth() {
      const session = await supabaseBrowser.auth.getSession();
      if (!session.data.session) {
        const signIn = await supabaseBrowser.auth.signInAnonymously();
        if (signIn.error) {
          setError(mapAuthErrorMessage(signIn.error.message));
          return;
        }
      }
      setAuthReady(true);
    }

    void ensureAuth();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    async function loadBackground() {
      try {
        const res = await apiFetch("/api/background", { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Failed to load background");
        setBackground(String(payload.background ?? ""));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }

    void loadBackground();
  }, [apiFetch, authReady]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const visibleJobs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const statusFiltered =
      filterStatus === "all" ? jobs : jobs.filter((job) => job.status === filterStatus);
    const searchFiltered = normalizedQuery
      ? statusFiltered.filter((job) => {
          const company = job.company.toLowerCase();
          const role = job.role.toLowerCase();
          return company.includes(normalizedQuery) || role.includes(normalizedQuery);
        })
      : statusFiltered;

    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    const filtered = searchFiltered.filter((job) => {
      if (!fromDate && !toDate) return true;
      const created = new Date(job.created_at);
      if (fromDate && created < fromDate) return false;
      if (toDate && created > toDate) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const diff =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === "oldest" ? diff : -diff;
    });
  }, [dateFrom, dateTo, filterStatus, jobs, searchQuery, sortOrder]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedId) || null,
    [jobs, selectedId]
  );
  const internshipCount = useMemo(
    () => jobs.filter((job) => isInternshipRole(job.role)).length,
    [jobs]
  );
  const dailyPoints = useMemo(() => buildDailyPoints(jobs), [jobs]);
  const chart = useMemo(() => {
    const width = 760;
    const height = 220;
    const padding = { left: 42, right: 16, top: 12, bottom: 28 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const n = dailyPoints.length;
    const maxY = Math.max(1, ...dailyPoints.map((p) => p.count));

    const xScale = (i: number) => {
      if (n <= 1) return padding.left + innerW / 2;
      return padding.left + (i / (n - 1)) * innerW;
    };
    const yScale = (y: number) => {
      const safe = Math.min(maxY, Math.max(0, y));
      return padding.top + innerH - (safe / maxY) * innerH;
    };

    const points = dailyPoints.map((p, i) => ({ x: xScale(i), y: yScale(p.count), ...p }));
    const linePath = points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    return { width, height, padding, innerW, innerH, maxY, points, linePath };
  }, [dailyPoints]);

  async function onSaveBackground() {
    setSavingBackground(true);
    setError("");
    try {
      const res = await apiFetch("/api/background", {
        method: "POST",
        body: JSON.stringify({ background })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save background");
      setBackground(String(payload.background ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSavingBackground(false);
    }
  }

  async function onCreateJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/jobs", {
        method: "POST",
        body: JSON.stringify(form)
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to create job");

      setJobs((prev) => [payload.job, ...prev]);
      setSelectedId(payload.job.id);
      setForm(initialForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function onBulkCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBulkSubmitting(true);
    setBulkResult("");
    setError("");

    try {
      const res = await apiFetch("/api/jobs/bulk", {
        method: "POST",
        body: JSON.stringify({ text: bulkInput, status: bulkStatus })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to mass parse jobs");

      setJobs((prev) => [...(payload.jobs || []), ...prev]);
      setBulkInput("");
      setBulkResult(
        `Inserted ${payload.insertedCount} jobs` +
          (payload.skippedCount ? `, skipped ${payload.skippedCount} invalid line(s)` : "")
      );
      if (!selectedId && payload.jobs?.length) {
        setSelectedId(payload.jobs[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function onAnalyze() {
    if (!selectedJob) return;
    setAnalyzing(true);
    setError("");
    try {
      const res = await apiFetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ id: selectedJob.id })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to analyze job");
      setJobs((prev) => prev.map((j) => (j.id === payload.job.id ? payload.job : j)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAnalyzing(false);
    }
  }

  async function onUpdateStatus(status: JobStatus) {
    if (!selectedJob) return;
    setUpdatingStatus(true);
    setError("");
    try {
      const res = await apiFetch("/api/jobs", {
        method: "PATCH",
        body: JSON.stringify({ id: selectedJob.id, status })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update status");
      setJobs((prev) => prev.map((j) => (j.id === payload.job.id ? payload.job : j)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function onGetEncouragement() {
    setEncouraging(true);
    setError("");
    try {
      const res = await apiFetch("/api/encouragement", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to get encouragement");
      setEncouragement(String(payload.message || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setEncouraging(false);
    }
  }

  function onFormEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      (e.currentTarget as HTMLFormElement).requestSubmit();
    }
  }

  return (
    <main className="app-root">
      <button
        type="button"
        onClick={() => setBackgroundOpen((prev) => !prev)}
        style={{ position: "fixed", right: 16, top: 16, zIndex: 20 }}
      >
        {backgroundOpen ? "Close Background" : "My Background"}
      </button>
      <button
        type="button"
        onClick={() => setEncouragementOpen((prev) => !prev)}
        style={{ position: "fixed", right: 16, top: 56, zIndex: 20 }}
      >
        {encouragementOpen ? "Close Encouragement" : "Get Encouragement from LLM"}
      </button>
      {(backgroundOpen || encouragementOpen) ? (
        <div
          onClick={() => {
            setBackgroundOpen(false);
            setEncouragementOpen(false);
          }}
          style={{ position: "fixed", inset: 0, background: "transparent", zIndex: 18 }}
        />
      ) : null}

      <aside
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          width: "min(360px, 90vw)",
          height: "100vh",
          borderLeft: "1px solid #000",
          background: "#fff",
          transform: backgroundOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.2s ease",
          padding: 12,
          zIndex: 19,
          overflowY: "auto"
        }}
      >
        <h2 style={{ marginTop: 38, marginBottom: 8, fontSize: 20 }}>My Background</h2>
        <textarea
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          placeholder="Education, projects, work history, and target roles."
          rows={12}
          style={{ width: "100%" }}
        />
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={onSaveBackground} disabled={savingBackground}>
            {savingBackground ? "Saving..." : "Save Background"}
          </button>
        </div>
      </aside>

      <aside
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: "min(420px, 95vw)",
          height: "100vh",
          borderRight: "1px solid #000",
          background: "#fff",
          transform: encouragementOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.2s ease",
          padding: 12,
          zIndex: 19,
          overflowY: "auto"
        }}
      >
        <h2 style={{ marginTop: 8, marginBottom: 8, fontSize: 20 }}>
          Get Some Encouragement from LLM
        </h2>
        <button type="button" onClick={onGetEncouragement} disabled={encouraging}>
          {encouraging ? "Thinking..." : "Give Me Encouragement"}
        </button>
        {encouragement ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              marginTop: 8,
              marginBottom: 0,
              border: "1px solid #000",
              padding: 8
            }}
          >
            {encouragement}
          </pre>
        ) : (
          <p style={{ marginTop: 8 }}>
            Click the button for a funny, supportive update based on your applications and background.
          </p>
        )}
      </aside>

      <h1 style={{ marginTop: 0, marginBottom: 12 }}>JobTracker</h1>
      <p style={{ marginTop: 0, marginBottom: 12, maxWidth: 1000 }}>
        Add jobs one-by-one or with Mass Parse, update statuses as you progress. <br></br>
        Enter your background in the right side bar for customized support. <br></br>
        Get some encouragement from AI as you wish.
      </p>

      <form
        onSubmit={onCreateJob}
        onKeyDown={onFormEnterSubmit}
        style={{ display: "grid", gap: 8, marginBottom: 16, maxWidth: 1000 }}
      >
        <input
          value={form.combinedText}
          onChange={(e) => {
            const combinedText = e.target.value;
            const parsed = parseCompanyRole(combinedText);
            setForm((prev) => ({
              ...prev,
              combinedText,
              company: parsed ? parsed.company : prev.company,
              role: parsed ? parsed.role : prev.role
            }));
          }}
          placeholder="Optional quick paste (e.g. Company: Role / 公司：职位)"
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 180px", gap: 8 }}>
          <input
            value={form.company}
            onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
            placeholder="Company"
            required
          />
          <input
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
            placeholder="Role"
            required
          />
          <select
            value={form.status}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, status: e.target.value as JobStatus }))
            }
          >
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </div>
        <input
          value={form.jobUrl}
          onChange={(e) => setForm((prev) => ({ ...prev, jobUrl: e.target.value }))}
          placeholder="Job post URL (optional)"
        />
        <div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Adding..." : "Add Job"}
          </button>
        </div>
      </form>

      <form
        onSubmit={onBulkCreate}
        onKeyDown={onFormEnterSubmit}
        style={{ display: "grid", gap: 8, marginBottom: 16, maxWidth: 1000, border: "1px solid #000", padding: 10 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong>Mass Parse</strong>
          <label>
            Status for all lines:{" "}
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as JobStatus)}
            >
              {JOB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          placeholder={
            "Paste one per line in flexible formats.\nDate headings are supported too (e.g. 3.26: / 3月26日:).\nExamples:\n3.26:\nGoogle, Software Engineer\nSoftware Engineer at Stripe\ncompany=OpenAI; role=Research Engineer\n字节跳动：算法实习生\nAirbnb -> Data Scientist"
          }
          rows={6}
        />
        <div>
          <button type="submit" disabled={bulkSubmitting}>
            {bulkSubmitting ? "Parsing..." : "Mass Parse & Add"}
          </button>
        </div>
        {bulkResult ? <p style={{ margin: 0 }}>{bulkResult}</p> : null}
      </form>

      {error ? (
        <p style={{ border: "1px solid #000", padding: 8, marginTop: 0, marginBottom: 16 }}>{error}</p>
      ) : null}

      <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search company or role"
          style={{ maxWidth: 420 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <label>
          Filter status:{" "}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | JobStatus)}
          >
            <option value="all">All</option>
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort by date:{" "}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <label>
          From:{" "}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label>
          To:{" "}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}>
          Clear Dates
        </button>
      </div>

      <section style={{ border: "1px solid #000", padding: 10, marginBottom: 12, maxWidth: 1100 }}>
        <p style={{ marginTop: 0, marginBottom: 8 }}>
          Total internships applied: <strong>{internshipCount}</strong>
        </p>
        <div style={{ border: "1px solid #000", padding: 8, overflowX: "auto" }}>
          {dailyPoints.length === 0 ? (
            <p style={{ margin: 0 }}>No data for trend chart yet.</p>
          ) : (
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} style={{ width: "100%", height: 220 }}>
              <line
                x1={chart.padding.left}
                y1={chart.padding.top + chart.innerH}
                x2={chart.padding.left + chart.innerW}
                y2={chart.padding.top + chart.innerH}
                stroke="#000"
              />
              <line
                x1={chart.padding.left}
                y1={chart.padding.top}
                x2={chart.padding.left}
                y2={chart.padding.top + chart.innerH}
                stroke="#000"
              />
              <path d={chart.linePath} fill="none" stroke="#000" strokeWidth={1} />
              {chart.points.map((p) => (
                <g key={p.date}>
                  <circle cx={p.x} cy={p.y} r={3.5} fill="#000" />
                  <title>{`${p.date}: ${p.count}`}</title>
                </g>
              ))}
              <text x={chart.padding.left} y={chart.height - 6} fontSize={12}>
                {chart.points[0]?.date}
              </text>
              <text
                x={chart.padding.left + chart.innerW}
                y={chart.height - 6}
                fontSize={12}
                textAnchor="end"
              >
                {chart.points[chart.points.length - 1]?.date}
              </text>
              <text
                x={chart.padding.left - 8}
                y={chart.padding.top + 10}
                fontSize={12}
                textAnchor="end"
              >
                {chart.maxY}
              </text>
              <text
                x={chart.padding.left - 8}
                y={chart.padding.top + chart.innerH}
                fontSize={12}
                textAnchor="end"
              >
                0
              </text>
            </svg>
          )}
        </div>
      </section>

      <section className="app-grid">
        <div style={{ overflowX: "auto", border: "1px solid #000" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Analyzed</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={tdStyle} colSpan={5}>
                    Loading...
                  </td>
                </tr>
              ) : visibleJobs.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={5}>
                    No jobs match current filter.
                  </td>
                </tr>
              ) : (
                visibleJobs.map((job) => {
                  const isSelected = job.id === selectedId;
                  return (
                    <tr
                      key={job.id}
                      onClick={() => setSelectedId(job.id)}
                      style={{ background: isSelected ? "#f0f0f0" : "#fff", cursor: "pointer" }}
                    >
                      <td style={tdStyle}>{job.company}</td>
                      <td style={tdStyle}>{job.role}</td>
                      <td style={tdStyle}>{formatStatus(job.status)}</td>
                      <td style={tdStyle}>{new Date(job.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>{job.analysis ? "Yes" : "No"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ border: "1px solid #000", padding: 12 }}>
          {selectedJob ? (
            <>
              <h2 style={{ marginTop: 0, marginBottom: 8 }}>{selectedJob.company}</h2>
              <p style={{ marginTop: 0, marginBottom: 8 }}>Role: {selectedJob.role}</p>
              <label style={{ display: "block", marginBottom: 8 }}>
                Status:{" "}
                <select
                  value={selectedJob.status}
                  onChange={(e) => onUpdateStatus(e.target.value as JobStatus)}
                  disabled={updatingStatus}
                >
                  {JOB_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedJob.job_url ? (
                <p style={{ marginTop: 0 }}>
                  URL: <a href={selectedJob.job_url}>{selectedJob.job_url}</a>
                </p>
              ) : null}
              <button onClick={onAnalyze} disabled={analyzing}>
                {analyzing ? "Generating..." : "Generate / Refresh LLM Summary"}
              </button>

              <hr style={{ border: 0, borderTop: "1px solid #000", margin: "12px 0" }} />

              {selectedJob.analysis ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <section>
                    <h3 style={h3Style}>Core requirements for the job</h3>
                    <ul style={ulStyle}>
                      {selectedJob.analysis.coreRequirements.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h3 style={h3Style}>Insights on preparing for interview / OA</h3>
                    <ul style={ulStyle}>
                      {selectedJob.analysis.prepInsights.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h3 style={h3Style}>Past OA coding tasks (if available)</h3>
                    {selectedJob.analysis.pastOATasks.length === 0 ? (
                      <p style={{ margin: 0 }}>No specific OA tasks identified.</p>
                    ) : (
                      <ul style={ulStyle}>
                        {selectedJob.analysis.pastOATasks.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {selectedJob.analysis.notes ? (
                    <section>
                      <h3 style={h3Style}>Notes</h3>
                      <p style={{ margin: 0 }}>{selectedJob.analysis.notes}</p>
                    </section>
                  ) : null}
                </div>
              ) : (
                <p style={{ marginBottom: 0 }}>
                  No analysis yet. Select &quot;Generate / Refresh LLM Summary&quot;.
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0 }}>Select a job row to view details.</p>
          )}
        </div>
      </section>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid #000",
  padding: 8
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #000",
  padding: 8,
  verticalAlign: "top"
};

const h3Style: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 6,
  fontSize: 18,
  fontWeight: 600
};

const ulStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 0,
  paddingLeft: 18
};
