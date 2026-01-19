import path from "node:path";

export function kebabCase(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function ensureList(value, fallback = ["TBD"]) {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }
  return value;
}

export function buildPrdMarkdown({
  featureName,
  introduction,
  goals,
  userStories,
  functionalRequirements,
  nonGoals,
  designConsiderations,
  technicalConsiderations,
  successMetrics,
  openQuestions
}) {
  const safeGoals = ensureList(goals);
  const safeUserStories = ensureList(userStories, []);
  const safeFunctional = ensureList(functionalRequirements);
  const safeNonGoals = ensureList(nonGoals);
  const safeDesign = ensureList(designConsiderations);
  const safeTechnical = ensureList(technicalConsiderations);
  const safeSuccess = ensureList(successMetrics);
  const safeOpen = ensureList(openQuestions);

  const introText = introduction || "TBD";

  const storyBlocks = safeUserStories
    .map((story) => {
      const criteria = ensureList(story.acceptanceCriteria, ["TBD"])
        .map((item) => `- [ ] ${item}`)
        .join("\n");
      return [
        `### ${story.id}: ${story.title}`,
        `**Description:** ${story.description}`,
        "",
        "**Acceptance Criteria:**",
        criteria
      ].join("\n");
    })
    .join("\n\n");

  const numberedFunctional = safeFunctional
    .map((item, index) => {
      if (/^FR-\d+:/i.test(item)) {
        return item;
      }
      return `FR-${index + 1}: ${item}`;
    })
    .map((item) => `- ${item}`)
    .join("\n");

  return [
    `# PRD: ${featureName}`,
    "",
    "## Introduction/Overview",
    introText,
    "",
    "## Goals",
    safeGoals.map((item) => `- ${item}`).join("\n"),
    "",
    "## User Stories",
    storyBlocks || "TBD",
    "",
    "## Functional Requirements",
    numberedFunctional,
    "",
    "## Non-Goals (Out of Scope)",
    safeNonGoals.map((item) => `- ${item}`).join("\n"),
    "",
    "## Design Considerations (Optional)",
    safeDesign.map((item) => `- ${item}`).join("\n"),
    "",
    "## Technical Considerations (Optional)",
    safeTechnical.map((item) => `- ${item}`).join("\n"),
    "",
    "## Success Metrics",
    safeSuccess.map((item) => `- ${item}`).join("\n"),
    "",
    "## Open Questions",
    safeOpen.map((item) => `- ${item}`).join("\n"),
    ""
  ].join("\n");
}

export function buildPrdJson({ project, branchName, description, userStories }) {
  const safeStories = Array.isArray(userStories) ? userStories : [];
  return {
    project,
    branchName,
    description,
    userStories: safeStories.map((story, index) => ({
      id: story.id,
      title: story.title,
      description: story.description,
      acceptanceCriteria: ensureList(story.acceptanceCriteria, ["TBD"]),
      priority: index + 1,
      passes: false,
      notes: ""
    }))
  };
}

export function resolveOutputPaths({ outputDir, featureName }) {
  const safeDir = outputDir || process.cwd();
  const tasksDir = path.join(safeDir, "tasks");
  const prdFileName = `prd-${kebabCase(featureName)}.md`;
  return {
    tasksDir,
    prdPath: path.join(tasksDir, prdFileName),
    prdJsonPath: path.join(safeDir, "prd.json")
  };
}
