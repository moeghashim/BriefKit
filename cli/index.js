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
  const summaryBlock = Array.isArray(summary) && summary.length > 0
    ? `Summary:\n${summary.map((item) => `- ${item}`).join("\n")}`
    : "";
  return [`Brief: ${brief}`, ...lines, summaryBlock].filter(Boolean).join("\n\n");
}

async function runInterview(brief) {
  const history = [];
  let done = false;
  let summary = null;

  while (!done) {
    const step = await generateInterviewStep({ brief, history });
    const question = step.message || "";
    if (!question) {
      throw new Error("Interview question missing.");
    }
    output.write(`\nQ${history.length + 1}: ${question}\n`);
    const answer = (await promptUser("Your answer: ")).trim();
    history.push({ question, answer: answer || "(no answer)" });
    done = Boolean(step.done);
    summary = Array.isArray(step.summary) ? step.summary : summary;
  }

  return { history, summary };
}

let rl;
async function promptUser(question) {
  return rl.question(question);
}

async function main() {
  rl = createInterface({ input, output });
  try {
    output.write("\nBriefKit PRD Interviewer (CLI)\n");
    output.write("Describe the product, answer the interview, then export PRD + prd.json.\n\n");

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
    const { history, summary } = await runInterview(brief);

    printDivider("Generating PRD");
    const inferred = await inferNamesFromBrief({ brief });
    const projectName = inferred.projectName || "Project";
    const featureName = inferred.featureName || "Core Feature";
    const description = inferred.description || brief;

    const clarifyingAnswers = buildClarifyingAnswers(brief, history, summary);

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
