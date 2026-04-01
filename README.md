# JobTracker (Next.js + Supabase + OpenAI)

A minimalist black/white app to track job applications in a spreadsheet-like table and generate LLM interview/OA preparation summaries.

## Features

- Add job entries with required company and role, plus optional job URL.
- Mass parse multiple lines in one submit (e.g., `Company, Role` per line), with cleaning and truncation before insert.
- Mass parse supports date headers like `3.26:` / `2026-03-26:`; subsequent entries inherit that date.
- Set a status per job: `applied`, `OA`, `interview`, `rejected`, `accepted`.
- Optional quick-paste field that auto-parses many formats, including obscure phrasing and separators.
- Filter jobs by status and sort by created date (newest/oldest).
- Filter jobs by date range (`From` / `To`) in addition to status and search.
- "Get Some Encouragement from LLM" section that uses your application data + background to generate a funny, supportive check-in.
- Update status from the details panel for each job.
- "My Background" is available in a sidebar panel, saved in backend, and injected into LLM analysis prompts.
- Spreadsheet view of all applications.
- Click a row to view details.
- Generate LLM summary with sections:
  - Core requirements for the job
  - Insights on preparing for interview/OA
  - Past OA coding tasks (if identified)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (placeholder now, fill later)
- Optional: `OPENAI_MODEL` (default `gpt-4.1-mini`)
- LLM web search is attempted automatically during analysis (falls back if unavailable)

Also in Supabase Auth settings:
- Enable **Anonymous sign-ins**

4. Create table in Supabase SQL editor:

- Run [`supabase/schema.sql`](supabase/schema.sql)

5. Run app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- Styling follows your constraints: black/white, square borders, Times New Roman, minimalist layout.
- The LLM output is structured JSON and stored in the `analysis` JSONB column.
- Your saved background is stored in `user_background` and used to personalize prep insights.
- Job status is stored in the `jobs.status` column.
- Current implementation uses anonymous Supabase auth + per-user RLS (`user_id = auth.uid()`).
