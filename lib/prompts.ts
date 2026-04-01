export function createAnalysisPrompt(input: {
  company: string;
  role: string;
  jobDescription: string;
  jobUrl?: string | null;
  userBackground?: string;
}) {
  const backgroundSection = input.userBackground?.trim()
    ? `Candidate Background:\n${input.userBackground.trim()}\n`
    : "";

  return `You are job-apply assistant.

Task:
Analyze job application entry and return interview/OA preparation guidance. Search online for the given company and role. Return info shared by previous employees/applicants when applicable.

Company: ${input.company}
Role: ${input.role}
Job URL: ${input.jobUrl ?? "Not provided"}
${backgroundSection}
Job Description:
${input.jobDescription || "Not provided"}

Output constraints:
- Return JSON only.
- Match this schema exactly:
{
  "coreRequirements": string[],
  "prepInsights": string[],
  "pastOATasks": string[],
  "notes": string
}

Guidance:
- coreRequirements: ONLY job-side requirements (degree, years of experience, required/preferred stack, domain expectations, responsibilities).
- Do NOT include candidate background in coreRequirements.
- Do NOT use "you/your profile" language in coreRequirements.
- prepInsights: concrete interview/OA prep steps based on role/JD, and personalize using Candidate Background when present.
- pastOATasks: include only if likely relevant to coding assessments.
- Keep each item concise.
- Search online for the given company and role. Return specific info shared by previous employees/applicants when applicable.
- Integrate user's background only in prepInsights and notes (never in coreRequirements).`;
}
