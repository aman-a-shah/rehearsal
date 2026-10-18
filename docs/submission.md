# Graph Hacks submission draft

These answers are ready to copy into the event form. The submission has not been sent. Add the public demo and video URLs after verifying them without signing in.

## Project

**Name:** Rehearsal

**Tagline:** Test incident repairs against customer requirements before applying them.

**Repository:** https://github.com/aman-a-shah/rehearsal

**Live deployment:** Pending deployment and public verification.

**Demo video:** Pending public upload of the recorded walkthrough.

**Suggested tracks:** Agents That Act on Connected Data; Company Brain.

## Short description

Rehearsal is an incident-repair workbench. A Backboard agent follows customer and service dependencies in FalkorDB, reads reviewed agreements and policies, then tests three repairs on isolated service copies. A repair that returns HTTP 200 can still fail a customer's requirements. Only a passing repair reaches owner approval, where the server checks the graph and outputs again before applying the change and saving a receipt.

## Problem and solution

During an incident, restoring a green status code can break a customer promise or harm another service user. The relevant facts are spread across dependencies, agreements, policies, and ownership records.

Rehearsal connects those facts in FalkorDB and uses them as executable constraints. In the synthetic Harbor incident, two customers lose exports after an enrichment request fails. Rollback breaks the current schema. Bypass restores HTTP 200 but removes provenance required by Alder's agreement. Verified cache passes only while its data meets the reviewed freshness policy.

The agent tests every candidate through real HTTP handlers on separate SQLite copies. The current owner approves an eligible proposal. Approval revalidates graph context, runtime state, and trial output; the service change and receipt commit together. FalkorDB stores the completed decision, its source citations, and an assigned follow-up.

## Where FalkorDB controls the outcome

- A multi-hop Cypher traversal follows customer → capability → operation → service to find the incident's affected customers. A separate worker-footprint query includes healthy customers who could be harmed by rollback.
- Active claims and their current source revisions supply provenance requirements, cache freshness, and the accountable owner. Missing or conflicting required facts block approval.
- An accepted policy revision supersedes the previous source and replaces active claims in one graph write. Lowering the cache limit from 900 to 600 seconds makes the same 720-second cache ineligible, leaving no passing repair.
- Completed decisions cite their evidence sources and create assigned follow-up tasks. The README shows the stored nodes, relationships, queries, and verification algorithm.

FalkorDB is the authority for current context. Backboard memory can recall an earlier recovery, but it cannot override a changed graph policy.

## Demo sequence

1. Inspect the failed exports, dependency map, and executed FalkorDB query.
2. Run a live Backboard investigation and inspect its actual MCP activity.
3. Show why HTTP 200 from bypass still violates Alder's sourced requirement.
4. Approve verified cache as the owner and inspect the recovery receipt.
5. Reset, accept a stricter graph-policy revision, and run the agent again. All repairs fail and no proposal is created.
6. Run the public examples: cache passes at exactly 900 seconds and fails at 901 seconds.

## Technology

FalkorDB/FalkorDBLite, parameterized Cypher, Backboard, MCP, Python 3.13, FastAPI, SQLite, React, TypeScript, and Vite. The frontend and API can run together in a persistent Docker container.

## Scope and disclosure

The workspace uses fictional company data and three predefined repairs. It is a simulator, not a production incident-remediation integration. Demo identities illustrate ownership; public mutations additionally require a separate operator session. Live provider actions have durable workspace quotas. Public examples use real tools and verification without paid model inference.

The project uses AI-assisted code. The repository documents the graph model, algorithms, limitations, setup, and verification results.

## Form completion

Use the signed-in submission panel on the [event page](https://www.wemakedevs.org/hackathons/falkordb). Preserve the registered team and member details. Attach the verified repository and video links, and the deployment link if available. Review the completed fields and save the site's confirmation after submitting.

The published deadline is **October 18, 2026, 11:59 PM IST**, which is **2:29 PM in Toronto**. The rules prefer a live deployment and accept local setup plus a working video if deployment is unavailable.
