# Cloud Engineer Simulator

> "I forgot I was learning Azure. I was just trying to keep my client's infrastructure alive."

A browser-based simulation game that teaches Microsoft Azure and DevOps by putting you in the
seat of a cloud engineer: take a client ticket, design and build the infrastructure, deploy it,
watch it run, and troubleshoot it when it breaks.

**Status:** early development (Preview). The first mission, *PixelForge Games: Launch Day*,
is being built.

- Fully simulated, entirely in the browser. No Azure subscription or credentials needed.
- Azure behaviour follows Microsoft Learn. Every rule the simulator enforces is listed with its
  source in [`Docs/AZURE_FACTS.md`](Docs/AZURE_FACTS.md).

## Development

Requires Node.js 22.12 or newer.

```bash
npm ci
npm run dev      # http://localhost:5173/cloud-engineer-sim/
npm run check    # typecheck, lint, test, build
```

Project docs live in [`Docs/`](Docs/): vision (`PROJECT_INTRO.md`), development rules
(`INSTRUCTIONS.md`), mission authoring (`MISSION_AUTHORING_GUIDE.md`), architecture and build
plan (`BOOTSTRAP_REPORT.md`) and decisions (`DECISIONS.md`).
