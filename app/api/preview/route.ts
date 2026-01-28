import { generatePrdData, inferNamesFromBrief } from "../../../lib/openai.js";

export const runtime = "nodejs";

type InterviewTurn = {
  question: string;
  answer: string;
};

function formatFeedback(feedback: unknown) {
  if (!Array.isArray(feedback)) {
    return "";
  }
  const items = feedback
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) {
    return "";
  }
  return `Feedback:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function buildClarifyingAnswers(brief: string, interview: InterviewTurn[], feedback?: unknown) {
  const lines = interview.map((turn, index) => {
    return `Q${index + 1}: ${turn.question}\nA${index + 1}: ${turn.answer}`;
  });
  const feedbackBlock = formatFeedback(feedback);
  return [`Brief: ${brief}`, ...lines, feedbackBlock].filter(Boolean).join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { brief, interview, feedback } = body || {};

    if (!brief) {
      return Response.json({ error: "Brief is required" }, { status: 400 });
    }

    const inferred = await inferNamesFromBrief({ brief });
    const projectName = inferred.projectName || "Project";
    const featureName = inferred.featureName || "Core Feature";
    const description = inferred.description || brief;

    const clarifyingAnswers = buildClarifyingAnswers(
      brief,
      Array.isArray(interview) ? interview : [],
      feedback
    );

    const prdData = await generatePrdData({
      projectName,
      featureName,
      description,
      branchName: `feature/${featureName.toLowerCase().replace(/\s+/g, "-")}`,
      clarifyingAnswers
    });

    return Response.json({
      features: prdData.features || [],
      userStories: prdData.userStories || []
    });
  } catch (error) {
    return Response.json({ error: "Preview failed" }, { status: 500 });
  }
}
