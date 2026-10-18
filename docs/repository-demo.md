# Record a repository repair

Open the private invitation link and choose **Harbor / order-service** under the example projects. It imports a runnable Python service: 30 files, 38 import relationships, and 46 tests. The incident and test command are already filled in. No upload or GitHub sign-in is needed.

## What the example demonstrates

A fixed coupon is split across an order's lines. Independently rounding each share loses or creates cents. The effect appears in checkout totals, partial refunds, receipts, and the accounting ledger. One root-cause repair can correct those failures across the service.

The graph makes those connections inspectable. In the verified run, FalkorDB selected 26 files, including eight dependent test files, and allowed edits to 18 source files. The model changed only `commerce/discounts.py`. Nine failing tests became 46 passing tests, then the same 46 passed in a second fresh Vercel sandbox. This is an observed run; later model proposals can differ.

## Screen and voice sequence

| Screen | Show | Explain |
| --- | --- | --- |
| Example projects | Open `order-service`; the source indexes without an upload | “This is a working order service with checkout, coupons, refunds, accounting, and tests.” |
| Incident brief | The one-cent coupon that produces a $3.00 charge instead of $2.99 | “The symptom appears in several places. I describe the expected behavior and keep the existing tests intact.” |
| Graph evidence | Fit the graph; select `commerce/discounts.py`; inspect imports, dependents, owner, and source | “FalkorDB follows the dependency relationships to select the investigation context and permitted edit scope.” |
| Run rehearsal | Click Run; show baseline, graph traversal, generation, testing, and repeat verification in Activity | “Rehearsal executes the original suite before it proposes a repair. The model works from the actual failure output and connected source.” |
| Tests | Original failure, candidate test output, and independent repeat | “The original suite has nine failures. The proposed repair passes all 46 tests, then passes again in a fresh sandbox.” Use the counts actually shown by your run. |
| Patch | Review the allocation algorithm and changed-file count; collapse the incident panel for more space | “The patch allocates whole cents first, then distributes the remainder deterministically. The tests, tax logic, and public API stay intact.” Describe the actual generated diff. |
| Graph evidence | Highlight patched source and compare All files with Investigation; expand the executed queries | “The patch changes this source file. Its dependents explain why checkout and refund tests matter, and these are the queries that selected that context.” |
| Download | Download the verified patch and show the application command | “This is a proposed source change. I review it before applying it to my repository.” |

The Patch tab is the actual generated unified diff. Green lines are additions; red lines are removals. Nothing is applied to the user's repository automatically. Verified means the configured tests passed in two fresh sandboxes, not that every possible production behavior is proven correct.

Run one rehearsal before recording to check readiness. Showing saved evidence is fine if you describe it as a completed run. If you cut waiting time, label the cut. Keep the real failure, graph, patch, and passing output readable. Free-host workspaces reset when the service sleeps; download the patch and finish the recording before leaving.

## Second substantial example

**Atlas / event-service** has 28 files, 32 import relationships, and 37 tests. Tied timestamps break cursor continuation, and conversion of decimal-string IDs to JavaScript numbers loses precision. The symptoms reach the feed, paginated exports, and credit replay.

The verified repair changed two source files: exact ID comparison in `src/domain/order.js`, and exclusive composite-cursor filtering in `src/query/window.js`. Eight failing tests became 37 passing tests, followed by a successful fresh repeat. Existing tenant isolation, cursor scope, validation, filters, retention, and input non-mutation tests remained intact.

## Other entry points

The three short examples remain under **Prefer a quick introduction?**: pricing rounding, pagination, and a timeout case whose existing tests pass. The timeout example requires a new failing regression before a repair can qualify.

To show a public import, use `https://github.com/aman-a-shah/rehearsal-python-example` or `https://github.com/aman-a-shah/rehearsal-node-example`. To show private source without OAuth, upload a ZIP. Supported projects use Python or Node.js/TypeScript with self-contained tests. Production services or secret-dependent tests need their own runner configuration.

The judge deployment supports patch downloads. On an OAuth-configured deployment, an authorized user can review the patch and open a draft PR; publication rechecks the branch and does not merge automatically.
