import { generatePrdData, inferNamesFromBrief } from "../../../lib/openai.js";
import { buildPrdJson, buildPrdMarkdown } from "../../../lib/prd.js";

export const runtime = "nodejs";

type InterviewTurn = {
  question: string;
  answer: string;
};

type FeatureOverride = {
  name: string;
  summary: string;
  userStoryIds: string[];
};

function buildClarifyingAnswers(brief: string, interview: InterviewTurn[], summary?: string[]) {
  const lines = interview.map((turn, index) => {
    return `Q${index + 1}: ${turn.question}\nA${index + 1}: ${turn.answer}`;
  });
  const summaryBlock = Array.isArray(summary) && summary.length > 0
    ? `Summary:\n${summary.map((item) => `- ${item}`).join("\n")}`
    : "";
  return [`Brief: ${brief}`, ...lines, summaryBlock].filter(Boolean).join("\n\n");
}

function applyFeatureOverrides(
  features: FeatureOverride[] | undefined,
  overrides: FeatureOverride[] | undefined
) {
  if (!overrides || overrides.length === 0) {
    return features;
  }
  return (features || []).map((feature, index) => {
    const override = overrides[index];
    if (!override) {
      return feature;
    }
    return {
      ...feature,
      name: override.name || feature.name,
      summary: override.summary || feature.summary,
      userStoryIds: Array.isArray(override.userStoryIds) && override.userStoryIds.length > 0
        ? override.userStoryIds
        : feature.userStoryIds
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { brief, interview, interviewSummary, featureOverrides } = body || {};

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
      interviewSummary
    );

    const prdData = await generatePrdData({
      projectName,
      featureName,
      description,
      branchName: `feature/${featureName.toLowerCase().replace(/\s+/g, "-")}`,
      clarifyingAnswers
    });

    const mergedFeatures = applyFeatureOverrides(prdData.features, featureOverrides);

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
      branchName: prdData.branchName || `feature/${featureName.toLowerCase().replace(/\s+/g, "-")}`,
      description: prdData.description || description,
      userStories: prdData.userStories
    });

    return Response.json({
      ...prdData,
      features: mergedFeatures || prdData.features,
      prdMarkdown,
      prdJson
    });
  } catch (error) {
    return Response.json({ error: "Generation failed" }, { status: 500 });
  }
}
