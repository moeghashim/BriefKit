#!/usr/bin/env node
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  generateClarifyingQuestions,
  generatePrdData
} from "../lib/openai.js";
import { buildPrdJson, buildPrdMarkdown, resolveOutputPaths } from "../lib/prd.js";
import { safeJsonStringify } from "../lib/json.js";

function printDivider(label) {
  output.write(`\n--- ${label} ---\n`);
}

function formatAnswerSummary(questions, answers) {
  return questions
    .map((question, index) => {
      const answer = answers[index] || "";
      return `${index + 1}. ${question.question}\nAnswer: ${answer}`;
    })
    .join("\n\n");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const rl = createInterface({ input, output });
  try {
    output.write("\nBriefKit PRD Generator\n");
    output.write("Answer the prompts to generate a PRD and prd.json.\n\n");

    const outputDirInput = (await rl.question(
      "Output directory for PRD + JSON (leave blank for current directory): "
    )).trim();
    const outputDir = outputDirInput
      ? path.resolve(outputDirInput)
      : process.cwd();

    const typeAnswer = (await rl.question(
      "Is this a new project or a new feature? (A) New project (B) New feature: "
    )).trim().toUpperCase();
    const isNewProject = typeAnswer === "A";

    const projectName = (await rl.question("Project/Product name: ")).trim();
    const featureName = (await rl.question(
      "Feature name (used for PRD title and filename): "
    )).trim();
    const description = (await rl.question(
      "One-sentence description of the feature/project: "
    )).trim();
    const branchName = (await rl.question(
      "Branch name (optional, press Enter to auto-generate): "
    )).trim();

    const resolvedBranch = branchName || `feature/${featureName.toLowerCase().replace(/\s+/g, "-")}`;

    printDivider("Clarifying Questions");
    const questionResponse = await generateClarifyingQuestions({
      featureName,
      description,
      isNewProject
    });

    const questions = Array.isArray(questionResponse.questions)
      ? questionResponse.questions
      : [];

    if (questions.length === 0) {
      throw new Error("No clarifying questions were generated.");
    }

    const answers = [];
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      output.write(`\n${i + 1}. ${q.question}\n`);
      (q.options || []).forEach((option) => output.write(`   ${option}\n`));
      const answer = (await rl.question("Your answer (letter or text): ")).trim();
      answers.push(answer || "(no answer)");
    }

    printDivider("Generating PRD");
    const clarifyingAnswers = formatAnswerSummary(questions, answers);

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
    const summary = {
      ok: true,
      outputDir,
      prdPath,
      prdJsonPath,
      project: prdData.project || projectName,
      branchName: prdData.branchName || resolvedBranch,
      feature: featureName,
      userStoryCount: Array.isArray(prdData.userStories) ? prdData.userStories.length : 0
    };
    output.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    output.write(`\nError: ${error.message}\n`);
    output.write(JSON.stringify({ ok: false, error: error.message }) + "\n");
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
