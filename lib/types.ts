export type AnalysisResult = {
  coreRequirements: string[];
  prepInsights: string[];
  pastOATasks: string[];
  notes?: string;
};

export type JobStatus = "applied" | "oa" | "interview" | "rejected" | "accepted";

export type JobRow = {
  id: string;
  user_id: string | null;
  company: string;
  role: string;
  status: JobStatus;
  job_description: string | null;
  job_url: string | null;
  analysis: AnalysisResult | null;
  analysis_updated_at: string | null;
  created_at: string;
};
