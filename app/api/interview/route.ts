import { generateInterviewStep } from "../../../lib/openai.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { brief, history } = body || {};

    if (!brief) {
      return Response.json({ error: "Brief is required" }, { status: 400 });
    }

    const data = await generateInterviewStep({
      brief,
      history: Array.isArray(history) ? history : []
    });

    return Response.json({
      message: typeof data?.message === "string" ? data.message : "",
      done: Boolean(data?.done),
      summary: Array.isArray(data?.summary) ? data.summary : null
    });
  } catch (error) {
    return Response.json({ error: "Interview failed" }, { status: 500 });
  }
}
