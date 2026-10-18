# Repository workspace boundaries

These controls apply to `/api/code`. The separate fictional company workspace retains its [operator controls](security.md).

The optional judge preview adds an expiring invitation to both workflows. An invitation in the URL fragment is exchanged for a signed Secure, HttpOnly cookie, then removed from the address bar. Anonymous requests cannot import, run, or read repository data. The shared invitation does not grant access to another visitor's workspace. Health/status remain public, invitation attempts are limited, and responses discourage search indexing.

- **Accounts:** random session tokens are hashed in SQLite. Cookies are HttpOnly and SameSite=Lax, and Secure in public mode. OAuth state expires in ten minutes and is bound to the originating browser. PKCE protects the code exchange. GitHub tokens and OAuth verifier records are encrypted with a server-held Fernet key.
- **Tenant isolation:** project, file, run, cancellation, download, deletion, and publication endpoints check the authenticated workspace. Unknown and foreign records return 404. Each snapshot has its own FalkorDB graph. GitHub credentials never enter another workspace, a model, or a sandbox.
- **Import:** repository URLs are restricted to GitHub. API requests use fixed endpoints; bounded archive redirects allow only GitHub's API and codeload hosts. Authorization headers are removed on codeload redirects. Branches resolve to immutable SHAs. Archive paths, links, duplicate files, expanded size, and file count are checked. Archives are read into validated data, never extracted on the host.
- **Credentials in source:** environment files, common credential files, private keys, recognized token patterns, binaries, and oversized files are filtered. This is not an exhaustive secret scanner. The UI lists skipped files. Relevant source and test output are sent to Backboard and its configured model provider. Repository proposals disable memory and do not share an assistant. Provider-side retention still applies.
- **Execution:** public runs use Vercel microVMs with minimal non-secret environment values. Setup allows only package registries; tests have no outbound access. VMs are destroyed on exit. Local Docker is explicitly enabled and prohibited in public mode. It has no network, host mounts, Docker socket, or API secrets. Logs use bounded buffers; timeouts and cleanup cover failures and cancellations.
- **Sandbox identity:** an optional Vercel function exchanges a server-only secret for a short-lived production project identity. It denies anonymous, preview, and non-POST requests; uses constant-time credential comparison; and sets no-store headers. The API accepts identity only from its configured HTTPS app origin, checks project/team and expiry, and does not follow redirects. Neither the shared secret nor the Vercel identity enters a test VM or browser response.
- **Patches:** edits must uniquely match original text, remain in graph-selected source files and the selected project directory, and respect protected tests/build configuration. New regression tests cannot replace existing files. Success requires an actual test report, no drop in test count, and a fresh repeat. These checks do not prove arbitrary code is correct or resistant to deliberate test evasion. Human diff review remains necessary.
- **Publication:** review digest, GitHub push permission, graph snapshot, and base SHA are checked. Only validated changed files are written to a separate branch and draft PR. No force-push, merge, or deployment occurs. Deterministic branches and PR lookup make retries recoverable. Branch creation can trigger repository CI.

## Persistent quotas

| Resource | Default |
| --- | --- |
| Runs globally | 4/hour; 12/day |
| Runs per account | 3/day for GitHub; 1/day for a guest |
| Runs per verified socket peer | 4/day |
| Model requests | 24/day globally; at most 3 per run |
| Sandboxes | 72/day globally |
| Imports | 20/day per peer; 100/day globally |
| Repository storage | 8 projects/account; 128 MiB of serialized project records globally |
| Imports in progress | 2 shared slots for GitHub downloads and ZIP decoding |
| ZIP bodies | 12 MiB compressed; 24 MiB expanded |
| Queued/running investigations | 4 globally; 1/account; one executor |

SQLite reserves usage before paid calls. Failures consume reservations. Guest-cookie replacement does not reset peer/global limits; deleting a project does not erase quotas. Limits survive restarts when the API uses persistent storage. These are request counts, not a dollar ceiling. Use independent account billing controls. The guided demo has a separate provider quota, so the account budget must cover both workflows.

The free judge deployment allows up to four runs per guest and twelve per ingress peer, still bounded by the shared four/hour, twelve/day, and model/sandbox limits above. Its ephemeral filesystem loses usage counters and workspace records on host sleep/restart. The invitation and its fixed expiry remain configured on the host. This restricted preview is not a deployment with durable billing controls or durable user data.

Peer limits use verified socket addresses. Without explicit proxy trust, visitors behind an ingress can share one peer bucket. Configure the host's documented proxy networks after verifying ingress behavior. Do not enable wildcard proxy trust.

## Persistence and deletion

Accounts, encrypted tokens, snapshots, runs, and reservations live on the API disk. Deleting a repository removes its source, graph, and run records. SQLite pages and platform backups may retain deleted bytes until storage maintenance. Provider records and GitHub PRs are not deleted. Production retention, account deletion, backup erasure, and organization audit policies need further operational configuration.
