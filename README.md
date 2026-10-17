# Rehearsal

**Test the repair. Keep the promise.**

Rehearsal investigates a broken customer export, tests three repairs against a working miniature service, and asks the accountable owner to approve only a repair that preserves the customer's requirements. FalkorDB connects the incident to customer agreements, dependencies, policies, and ownership.

This repository is a rebuild of an earlier personal prototype. Its Git history records the actual rebuild milestones, not the date the original concept or prototype was created. All company data, people, and incidents are synthetic. See [rebuild notes](docs/rebuild.md).

## Development

Python 3.13 and Node 22 or later are required. The embedded FalkorDB runtime is pinned to the version exercised on macOS arm64.

```sh
npm run setup
npm run dev
```

The frontend uses http://127.0.0.1:5180 and the API uses http://127.0.0.1:8780. Guided rehearsals require no provider account. Live agent mode requires an Anthropic API key in a local `.env` file.

## Rebuild milestones

1. Repository and reproducible local development commands.
2. Graph context, executable trials, and evidence-bound approval.
3. Incident workspace, source review, and decision history.
4. Regression coverage, browser verification, and demo documentation.

The source is AI-assisted. The authors remain responsible for verifying and understanding it. This repository makes no claim that prior work qualifies for any particular competition.
