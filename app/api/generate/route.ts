import { generatePrdData } from "../../../lib/openai.js";
import { buildPrdJson, buildPrdMarkdown } from "../../../lib/prd.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      projectName,
      featureName,
      branchName,
      description,
      answers
    } = body || {};

    if (!projectName || !featureName || !description) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const resolvedBranch = branchName || `feature/${featureName.toLowerCase().replace(/\s+/g, "-")}`;

    const clarifyingAnswers = Array.isArray(answers)
      ? answers
          .map((item: { question: string; answer: string }, index: number) =>
            `${index + 1}. ${item.question}\nAnswer: ${item.answer || "(no answer)"}`
          )
          .join("\n\n")
      : "";

    const prdData = await generatePrdData({
      projectName,
      featureName,
      description,
      branchName: resolvedBranch,
      clarifyingAnswers
    });

    const prdMarkdown = buildPrdMarkdown({
      featureName,
      introduction: prdData.introduction,
      goals: prdData.goals,
      userStories: prdData.userStories,
      functionalRequirements: prdData.functionalRequirements,
      nonGoals: prdData.nonGoals,
      designConsiderations: prdData.designConsiderations,
      technicalConsiderations: prdData.technicalConsiderations,
      successMetrics: prdData.successMetrics,
      openQuestions: prdData.openQuestions
    });

    const prdJson = buildPrdJson({
      project: prdData.project || projectName,
      branchName: prdData.branchName || resolvedBranch,
      description: prdData.description || description,
      userStories: prdData.userStories
    });

    return Response.json({
      ...prdData,
      prdMarkdown,
      prdJson
    });
  } catch (error) {
    return Response.json({ error: "Generation failed" }, { status: 500 });
  }
}
