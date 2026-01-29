#!/usr/bin/env node
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  generateInterviewStep,
  generatePrdData,
  inferNamesFromBrief
} from "../lib/openai.js";
import { buildPrdJson, buildPrdMarkdown, resolveOutputPaths } from "../lib/prd.js";
import { safeJsonStringify } from "../lib/json.js";

function printDivider(label) {
  output.write(`\n--- ${label} ---\n`);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function buildClarifyingAnswers(brief, interview, summary) {
  const lines = interview.map((turn, index) => {
    return `Q${index + 1}: ${turn.question}\nA${index + 1}: ${turn.answer}`;
  });
  const summaryBlock =
    Array.isArray(summary) && summary.length > 0
      ? `Summary:\n${summary.map((item) => `- ${item}`).join("\n")}`
      : "";
  return [`Brief: ${brief}`, ...lines, summaryBlock].filter(Boolean).join("\n\n");
}

function formatFeedback(feedback) {
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

function buildClarifyingAnswersWithFeedback(brief, interview, summary, feedback) {
  const base = buildClarifyingAnswers(brief, interview, summary);
  const feedbackBlock = formatFeedback(feedback);
  return [base, feedbackBlock].filter(Boolean).join("\n\n");
}

function buildFeedback(featureMessages, storyMessages, features, stories) {
  const feedback = [];
  const storyLookup = Array.isArray(stories)
    ? stories.reduce((acc, story) => {
        acc[story.id] = story;
        return acc;
      }, {})
    : {};

  Object.entries(featureMessages).forEach(([index, messages]) => {
    if (!Array.isArray(messages) || messages.length === 0) return;
    const idx = Number(index);
    const feature = Array.isArray(features) ? features[idx] : null;
    const label = feature?.name ? `Feature "${feature.name}"` : `Feature ${idx + 1}`;
    messages.forEach((message) => {
      const trimmed = String(message || "").trim();
      if (trimmed) {
        feedback.push(`${label}: ${trimmed}`);
      }
    });
  });

  Object.entries(storyMessages).forEach(([storyId, messages]) => {
    if (!Array.isArray(messages) || messages.length === 0) return;
    const story = storyLookup[storyId];
    const label = story ? `Story ${story.id}: ${story.title}` : `Story ${storyId}`;
    messages.forEach((message) => {
      const trimmed = String(message || "").trim();
      if (trimmed) {
        feedback.push(`${label}: ${trimmed}`);
      }
    });
  });

  return feedback;
}

function printPreview(features, stories) {
  output.write("\n--- Preview ---\n");
  if (!Array.isArray(features) || features.length === 0) {
    output.write("No features yet. Keep answering to generate a preview.\n");
    return;
  }
  features.forEach((feature, index) => {
    const name = feature?.name || `Feature ${index + 1}`;
    const summary = feature?.summary ? `  ${feature.summary}\n` : "";
    const storiesList = Array.isArray(feature?.userStoryIds) && feature.userStoryIds.length > 0
      ? `  Stories: ${feature.userStoryIds.join(", ")}\n`
      : "";
    output.write(`\n${index + 1}. ${name}\n${summary}${storiesList}`);
  });

  if (Array.isArray(stories) && stories.length > 0) {
    output.write("\nUser Stories\n");
    stories.forEach((story) => {
      output.write(`- ${story.id}: ${story.title}\n`);
      if (story.description) {
        output.write(`  ${story.description}\n`);
      }
      if (Array.isArray(story.acceptanceCriteria) && story.acceptanceCriteria.length > 0) {
        output.write("  Acceptance Criteria\n");
        story.acceptanceCriteria.forEach((item) => {
          output.write(`    - ${item}\n`);
        });
      }
    });
  }
}

async function generatePreview({ brief, history, summary, feedback }) {
  const inferred = await inferNamesFromBrief({ brief });
  const projectName = inferred.projectName || "Project";
  const featureName = inferred.featureName || "Core Feature";
  const description = inferred.description || brief;
  const clarifyingAnswers = buildClarifyingAnswersWithFeedback(brief, history, summary, feedback);

  const prdData = await generatePrdData({
    projectName,
    featureName,
    description,
    branchName: `feature/${featureName.toLowerCase().replace(/\s+/g, "-")}`,
    clarifyingAnswers
  });

  return {
    features: Array.isArray(prdData.features) ? prdData.features : [],
    userStories: Array.isArray(prdData.userStories) ? prdData.userStories : []
  };
}

async function runInterview(brief, { skipPreview } = {}) {
  const history = [];
  let done = false;
  let summary = null;
  const featureMessages = {};
  const storyMessages = {};
  let previewFeatures = [];
  let previewStories = [];

  while (!done) {
    const step = await generateInterviewStep({ brief, history });
    const question = step.message || "";
    if (!question) {
      throw new Error("Interview question missing.");
    }
    output.write(`\nQ${history.length + 1}: ${question}\n`);
    const answerInput = (await promptUser("Your answer (or /finish, /restart): ")).trim();
    if (answerInput.toLowerCase() === "/restart") {
      return { restart: true };
    }
    if (answerInput.toLowerCase() === "/finish") {
      summary = Array.isArray(step.summary) ? step.summary : summary;
      done = true;
      break;
    }

    history.push({ question, answer: answerInput || "(no answer)" });
    done = Boolean(step.done);
    summary = Array.isArray(step.summary) ? step.summary : summary;

    if (!skipPreview) {
      const feedback = buildFeedback(featureMessages, storyMessages, previewFeatures, previewStories);
      const preview = await generatePreview({ brief, history, summary, feedback });
      previewFeatures = preview.features;
      previewStories = preview.userStories;
      printPreview(previewFeatures, previewStories);
    }

    if (!skipPreview) {
      let feedbackLoop = true;
      while (feedbackLoop) {
        const choice = (await promptUser("Add message? [f]eature, [s]tory, [n]ext, /finish, /restart: "))
          .trim()
          .toLowerCase();
        if (!choice || choice === "n") {
          feedbackLoop = false;
          continue;
        }
        if (choice === "/restart") {
          return { restart: true };
        }
        if (choice === "/finish") {
          done = true;
          feedbackLoop = false;
          continue;
        }
        if (choice === "f") {
          if (!Array.isArray(previewFeatures) || previewFeatures.length === 0) {
            output.write("No features available yet.\n");
            continue;
          }
          const indexInput = (await promptUser("Feature number: ")).trim();
          const index = Number(indexInput) - 1;
          if (!Number.isInteger(index) || index < 0 || index >= previewFeatures.length) {
            output.write("Invalid feature number.\n");
            continue;
          }
          const message = (await promptUser("Message about this feature: ")).trim();
          if (!message) {
            output.write("Message cannot be empty.\n");
            continue;
          }
          featureMessages[index] = [...(featureMessages[index] || []), message];
        } else if (choice === "s") {
          if (!Array.isArray(previewStories) || previewStories.length === 0) {
            output.write("No stories available yet.\n");
            continue;
          }
          const storyId = (await promptUser("Story ID (e.g. US-001): ")).trim();
          const storyExists = previewStories.some((story) => story.id === storyId);
          if (!storyExists) {
            output.write("Story ID not found.\n");
            continue;
          }
          const message = (await promptUser(`Message about ${storyId}: `)).trim();
          if (!message) {
            output.write("Message cannot be empty.\n");
            continue;
          }
          storyMessages[storyId] = [...(storyMessages[storyId] || []), message];
        } else {
          output.write("Choose f, s, n, /finish, or /restart.\n");
          continue;
        }

        const refreshedFeedback = buildFeedback(
          featureMessages,
          storyMessages,
          previewFeatures,
          previewStories
        );
        const refreshedPreview = await generatePreview({
          brief,
          history,
          summary,
          feedback: refreshedFeedback
        });
        previewFeatures = refreshedPreview.features;
        previewStories = refreshedPreview.userStories;
        printPreview(previewFeatures, previewStories);
      }
    }
  }

  return { history, summary, featureMessages, storyMessages, previewFeatures, previewStories };
}

let rl;
async function promptUser(question) {
  return rl.question(question);
}

async function main() {
  rl = createInterface({ input, output });
  try {
    output.write("\nBriefKit PRD Interviewer (CLI)\n");
    output.write("Describe the product, answer the interview, then export PRD + prd.json.\n");
    output.write("Preview updates after each answer. Use --skip-preview to disable.\n\n");

    const skipPreview = process.argv.slice(2).includes("--skip-preview");
    const outputDirInput = (await promptUser(
      "Output directory for PRD + JSON (leave blank for current directory): "
    )).trim();
    const outputDir = outputDirInput
      ? path.resolve(outputDirInput)
      : process.cwd();

    const brief = (await promptUser("What do you want to build? ")).trim();
    if (!brief) {
      throw new Error("Brief is required.");
    }

    printDivider("Interview");
    let interviewResult = await runInterview(brief, { skipPreview });
    while (interviewResult?.restart) {
      output.write("\nRestarting interview...\n");
      interviewResult = await runInterview(brief, { skipPreview });
    }
    const {
      history,
      summary,
      featureMessages,
      storyMessages,
      previewFeatures,
      previewStories
    } = interviewResult;

    printDivider("Generating PRD");
    const inferred = await inferNamesFromBrief({ brief });
    const projectName = inferred.projectName || "Project";
    const featureName = inferred.featureName || "Core Feature";
    const description = inferred.description || brief;

    const feedback = buildFeedback(
      featureMessages || {},
      storyMessages || {},
      previewFeatures || [],
      previewStories || []
    );
    const clarifyingAnswers = buildClarifyingAnswersWithFeedback(brief, history, summary, feedback);

    const prdData = await generatePrdData({
      projectName,
      featureName,
      description,
      branchName: `feature/${featureName.toLowerCase().replace(/\s+/g, "-")}`,
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
      branchName: prdData.branchName || `feature/${featureName.toLowerCase().replace(/\s+/g, "-")}`,
      description: prdData.description || description,
      userStories: prdData.userStories
    });

    const { tasksDir, prdPath, prdJsonPath } = resolveOutputPaths({
      outputDir,
      featureName
    });

    await ensureDir(tasksDir);
    await fs.writeFile(prdPath, prdMarkdown, "utf8");
    await fs.writeFile(prdJsonPath, safeJsonStringify(prdJson), "utf8");

    printDivider("PRD MARKDOWN");
    output.write(`${prdMarkdown}\n`);

    printDivider("PRD JSON");
    output.write(`${safeJsonStringify(prdJson)}\n`);

    printDivider("MACHINE SUMMARY");
    const summaryJson = {
      ok: true,
      outputDir,
      prdPath,
      prdJsonPath,
      project: prdData.project || projectName,
      branchName: prdData.branchName || `feature/${featureName.toLowerCase().replace(/\s+/g, "-")}`,
      feature: featureName,
      userStoryCount: Array.isArray(prdData.userStories) ? prdData.userStories.length : 0
    };
    output.write(`${JSON.stringify(summaryJson)}\n`);
  } catch (error) {
    output.write(`\nError: ${error.message}\n`);
    output.write(JSON.stringify({ ok: false, error: error.message }) + "\n");
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
