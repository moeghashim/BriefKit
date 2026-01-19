# BriefKit PRD Interviewer

A minimalist monochrome web + CLI tool to interview users and generate PRDs plus `prd.json` outputs.

## Requirements

- Node 18+
- `OPENAI_API_KEY` environment variable

## CLI Usage

```bash
export OPENAI_API_KEY="your-key"
node cli/index.js
```

The CLI:
- Prompts for project/feature details
- Asks 3-5 clarifying questions with lettered options
- Generates `tasks/prd-[feature-name].md` and `prd.json`
- Prints both outputs to stdout
- Emits a machine-readable summary JSON line at the end

You can also run:

```bash
npm run prd
```

## Web App

```bash
export OPENAI_API_KEY="your-key"
npm install
npm run dev
```

Open `http://localhost:3000` to record interview answers, transcribe with Whisper, and generate the PRD + feature table.

## Environment

Optional:
- `OPENAI_MODEL` to override the default generation model (`gpt-4o-mini`).
