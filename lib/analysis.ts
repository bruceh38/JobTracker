import { getOpenAIClient } from "@/lib/openai";
import { createAnalysisPrompt } from "@/lib/prompts";
import type { AnalysisResult } from "@/lib/types";

const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export async function generateAnalysis(input: {
  company: string;
  role: string;
  jobDescription: string;
  jobUrl?: string | null;
  userBackground?: string;
}): Promise<AnalysisResult> {
  const openai = getOpenAIClient();
  const prompt = createAnalysisPrompt(input);
  const baseRequest = {
    model,
    input: [
      {
        role: "user" as const,
        content: prompt
      }
    ],
    temperature: 0.2
  };

  let text = "";
  try {
    const response = await openai.responses.create({
      ...baseRequest,
      tools: [{ type: "web_search_preview" }]
    });
    text = response.output_text?.trim() || "";
  } catch {
    const response = await openai.responses.create(baseRequest);
    text = response.output_text?.trim() || "";
  }

  if (!text) {
    throw new Error("OpenAI did not return output text");
  }

  let parsed: unknown;
  try {
    parsed = parseAnalysisJson(text);
  } catch {
    const retry = await openai.responses.create({
      ...baseRequest,
      input: [
        {
          role: "user" as const,
          content: `${prompt}\n\nReturn strict JSON only. Do not include markdown, commentary, or citations.`
        }
      ]
    });
    const retryText = retry.output_text?.trim() || "";
    if (!retryText) {
      throw new Error("OpenAI returned empty output after retry");
    }
    try {
      parsed = parseAnalysisJson(retryText);
    } catch {
      throw new Error("OpenAI response was not valid JSON");
    }
  }

  const data = parsed as Partial<AnalysisResult>;
  return {
    coreRequirements: Array.isArray(data.coreRequirements)
      ? data.coreRequirements.map(String)
      : [],
    prepInsights: Array.isArray(data.prepInsights) ? data.prepInsights.map(String) : [],
    pastOATasks: Array.isArray(data.pastOATasks) ? data.pastOATasks.map(String) : [],
    notes: typeof data.notes === "string" ? data.notes : ""
  };
}

function parseAnalysisJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with extraction fallbacks.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate);
  }

  throw new Error("No JSON object found in model output");
}
