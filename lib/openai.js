import OpenAI from "openai";
import { extractJson } from "./json.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return new OpenAI({ apiKey });
}

async function generateJsonResponse({ system, user, temperature = 0.2, model = DEFAULT_MODEL }) {
  const client = getOpenAIClient();
  const payload = {
    model,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };

  try {
    const response = await client.chat.completions.create({
      ...payload,
      response_format: { type: "json_object" }
    });
    const content = response.choices?.[0]?.message?.content || "";
    return extractJson(content);
  } catch (error) {
    const fallbackResponse = await client.chat.completions.create(payload);
    const content = fallbackResponse.choices?.[0]?.message?.content || "";
    return extractJson(content);
  }
}

export async function generateClarifyingQuestions({ featureName, description, isNewProject }) {
  const system =
    "You are a product strategist. Create 3 to 5 essential clarifying questions with lettered options (A-D). Always include an 'Other: [please specify]' option. Output JSON only.";
  const user = `Feature: ${featureName}\nType: ${isNewProject ? "New project" : "New feature"}\nDescription: ${description}\n\nReturn JSON in the shape: {\n  "questions": [\n    {\n      "question": "...",\n      "options": ["A. ...", "B. ...", "C. ...", "D. Other: [please specify]"]\n    }\n  ]\n}`;

  return generateJsonResponse({ system, user, temperature: 0.3 });
}

export async function generatePrdData({
  projectName,
  featureName,
  description,
  branchName,
  clarifyingAnswers
}) {
  const system =
    "You are a senior product manager. Use the inputs to produce a structured PRD plan. Output JSON only.";
  const user = `Inputs:\n- Project: ${projectName}\n- Feature: ${featureName}\n- Description: ${description}\n- Branch: ${branchName}\n- Clarifying answers:\n${clarifyingAnswers}\n\nReturn JSON in this shape:\n{\n  "project": "...",\n  "branchName": "...",\n  "description": "...",\n  "introduction": "...",\n  "goals": ["..."],\n  "features": [\n    {\n      "name": "...",\n      "summary": "...",\n      "userStoryIds": ["US-001", "US-002"]\n    }\n  ],\n  "userStories": [\n    {\n      "id": "US-001",\n      "title": "...",\n      "description": "As a [user], I want ... so that ...",\n      "acceptanceCriteria": ["...", "...", "Typecheck passes"]\n    }\n  ],\n  "functionalRequirements": ["FR-1: ...", "FR-2: ..."],\n  "nonGoals": ["..."],\n  "designConsiderations": ["..."],\n  "technicalConsiderations": ["..."],\n  "successMetrics": ["..."],\n  "openQuestions": ["..."]\n}\n\nRules:\n- Include 3 to 7 features.\n- Provide 4 to 10 user stories.\n- Acceptance criteria must be verifiable and specific.\n- Keep wording concise and implementation-ready.\n- Do NOT mention external tools or dev-browser in acceptance criteria unless explicitly required by the inputs.`;

  return generateJsonResponse({ system, user, temperature: 0.25 });
}
