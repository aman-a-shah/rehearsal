# Record a real repository repair

For the temporary judge link, open the invitation first. Start with **Harbor / pricing-service**, then show a public GitHub import or ZIP upload. **Atlas / event-feed** exercises Node.js; **Relay / timeout-service** starts with passing tests and requires a generated failing regression. Download the patch before leaving because the free host clears workspaces when it sleeps. GitHub sign-in is optional for this preview.

Use the Python pricing repository for the main demonstration. Its bug is visible in one assertion, while its graph also shows the checkout module and dependent tests. Keep a second tab open on the repository.

## Before recording

Open the private invitation and import `https://github.com/aman-a-shah/rehearsal-python-example` on `main`. No GitHub sign-in is needed. Confirm the sandbox and provider are connected. The test command is `python -m unittest discover -s tests -v`; no setup command is needed. Use an OAuth-configured deployment only if recording draft PR publication as well.

Use this incident description:

> Customers are overcharged for small orders. discounted_total should round the final discounted subtotal once to the nearest cent using ROUND_HALF_UP. Three items at $0.05 with a 10% discount should cost $0.14, but the service returns $0.15. Preserve validation of negative quantities and invalid discounts.

Perform one rehearsal before recording to verify account readiness and familiarize yourself with the output. Model wording and candidate count vary. Recording an already completed run is fine if you say that you are showing its saved execution evidence. Do not disguise prerecorded output as a new live run. Deleting a repository does not refund usage. The free host resets all workspace state when it sleeps; record and download the patch before leaving.

## A concise screen-and-voice sequence

| Screen | What to show | Suggested narration |
| --- | --- | --- |
| GitHub source and failing test | `pricing.py` and the small-order assertion | “This service overcharges a small order because it rounds each item's discount before multiplying the quantity.” |
| Import and incident | Repository URL, pinned commit, test command, incident text | “I import the real repository and describe the failure. Rehearsal saves this exact commit and runs its existing tests in an isolated sandbox.” |
| Graph | Open `pricing.py`; trace its imports and dependents to checkout and both test modules | “FalkorDB maps source files, imports, symbols, and owners. These graph queries determine the source context the agent receives and where it is allowed to propose changes.” |
| Original test evidence | Six tests, one failing assertion, `$0.15` versus `$0.14` | “The first run reproduces the bug. This is output from executing the repository, not a predicted score.” |
| Generated patch | Diff moves rounding to the final subtotal | “The model proposes a source change. Existing tests and build configuration are protected. Each candidate runs from a fresh snapshot.” |
| Passing tests and repeat | Six passing tests, then the separate verification run | “This patch passes all six checks, and Rehearsal repeats them in another fresh sandbox. Passing tests are evidence for these checks; I still review the change.” |
| Review and download | Read the diff, download the patch, show the local application command | “I review the patch and download it to apply to the tested commit. The original repository is unchanged.” |

On a deployment with GitHub OAuth configured, optionally show the review checkbox, draft PR, and its base commit. Explain that publication rechecks the branch and never merges automatically. The free judge preview uses patch downloads.

Let the actual execution determine timing. If a run takes longer than the video allows, cut the waiting period and label the cut. Keep the failure, graph query, diff, and both real test results visible long enough to read.

## Optional second case

The Node repository has a duplicate pagination boundary. `pageAfter` uses `>=` where the cursor must be exclusive. Its five `node:test` cases demonstrate a different language and test runner using the same workflow.

For a bug missing from existing tests, choose **Relay / timeout-service**: four tests initially pass; a new regression must expose that integer zero is treated as a missing timeout; the repair must pass the expanded suite twice. The generated test count can vary. This demonstrates why the system requires a failing regression before accepting a fix.

Supported repositories are bounded Python and Node.js/TypeScript projects with self-contained tests. Explain those limits directly. The project investigates code and produces reviewed patches; it does not connect to arbitrary production infrastructure or guarantee incident resolution.
