import { generatePrdData, inferNamesFromBrief } from "../../../lib/openai.js";

export const runtime = "nodejs";

type InterviewTurn = {
  question: string;
  answer: string;
};

function buildClarifyingAnswers(brief: string, interview: InterviewTurn[]) {
  const lines = interview.map((turn, index) => {
    return `Q${index + 1}: ${turn.question}\nA${index + 1}: ${turn.answer}`;
  });
  return [`Brief: ${brief}`, ...lines].join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { brief, interview } = body || {};

    if (!brief) {
      return Response.json({ error: "Brief is required" }, { status: 400 });
    }

    const inferred = await inferNamesFromBrief({ brief });
    const projectName = inferred.projectName || "Project";
    const featureName = inferred.featureName || "Core Feature";
    const description = inferred.description || brief;

    const clarifyingAnswers = buildClarifyingAnswers(brief, Array.isArray(interview) ? interview : []);

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
