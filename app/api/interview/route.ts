import { extractJson } from "../../../lib/json.js";
import { getOpenAIClient } from "../../../lib/openai.js";

export const runtime = "nodejs";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type InterviewTurn = {
  question: string;
  answer: string;
};

function formatHistory(history: InterviewTurn[]) {
  return history
    .map((turn, index) => {
      return `Q${index + 1}: ${turn.question}\nA${index + 1}: ${turn.answer}`;
    })
    .join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { brief, history } = body || {};

    if (!brief) {
      return Response.json({ error: "Brief is required" }, { status: 400 });
    }

    const messages = [
      {
        role: "system",
        content:
          "You are BriefKit, a product interviewer focused on building the product. Use Codex 5.2 thinking to ask one concise, high-signal question at a time. Tailor each question to the user's idea. Cover problem, user, goals, scope, workflows, data, integrations, constraints, success metrics, risks, and dependencies. Do NOT ask about marketing, sales, pricing, support, customer success, or go-to-market. Do NOT ask about budget or timeline. When enough information is collected, respond with done=true and provide a short summary list. Keep questions under 25 words. Output JSON only."
      },
      {
        role: "user",
        content: `Brief: ${brief}\n\nConversation so far:\n${formatHistory(Array.isArray(history) ? history : [])}\n\nReturn JSON: {\n  "message": "next question or completion message",\n  "done": false,\n  "summary": ["optional bullets"]\n}`
      }
    ];

    const client = getOpenAIClient();
    const payload = {
      model: DEFAULT_MODEL,
      temperature: 0.3,
      messages
    };

    let response;
    try {
      response = await client.chat.completions.create({
        ...payload,
        response_format: { type: "json_object" }
      });
    } catch (error) {
      response = await client.chat.completions.create(payload);
    }

    const content = response.choices?.[0]?.message?.content || "";
    const data = extractJson(content);

    return Response.json({
      message: typeof data.message === "string" ? data.message : "",
      done: Boolean(data.done),
      summary: Array.isArray(data.summary) ? data.summary : null
    });
  } catch (error) {
    return Response.json({ error: "Interview failed" }, { status: 500 });
  }
}
