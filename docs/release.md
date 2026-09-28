# Releasing shotlog

CI is the publish path. The Release workflow follows successful push CI on `main`, opens the Changesets version PR, then publishes after that PR is merged and CI passes. The publish command builds the package and runs the production Smoke Test with `SMOKE_REQUIRE_ALL=1` before publishing to `latest`. Failures and missing credentials block publishing. Opening a version PR does not send smoke emails.

## Repository secrets

| Secret | Purpose |
| --- | --- |
| `NPM_TOKEN` | npm publish access for `shotlog` |
| `RESEND_API_KEY` | Resend **full_access** key, for sending and reading delivery status |
| `SMOKE_FROM` | Sender identity verified with both Resend and SES |
| `SMOKE_INBOX` | Controlled test inbox accepting both providers; verify it too if SES is sandboxed |
| `SMOKE_SES_REGION` | AWS region containing the SES identity |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS credentials permitted to send SES email |
| `AWS_SESSION_TOKEN` | Required only for temporary AWS credentials |
| `UPLOADFILE_TOKEN` | UploadFile app token permitting upload, private signing, and deletion |
| `SMOKE_WEBHOOK_URL`, `SMOKE_WEBHOOK_SECRET` | Optional external receiver and its shared signing secret; otherwise the test starts a local receiver with an ephemeral signing key |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Site deployment credentials and project identity; all three are needed for production deployment |

`GITHUB_TOKEN` is supplied by Actions. Enable Actions permission to create pull requests. Keep `id-token: write` and `NPM_CONFIG_PROVENANCE=true` enabled.

**TODO(COR-235):** Choose the canonical repository, then add `repository` and `bugs` to `packages/shotlog/package.json`. Use `{ "type": "git", "url": "git+https://github.com/OWNER/REPO.git", "directory": "packages/shotlog" }` for `repository` and the canonical issues URL for `bugs`. Repository metadata must match the publishing repository for provenance. Keep the site's GitHub link visibly marked TODO until this is settled.

## Local smoke

Use Node 20.19+ and `pnpm install --frozen-lockfile`. Supply the same provider variables from your secret manager or an untracked shell environment, then run:

```sh
pnpm smoke
SMOKE_REQUIRE_ALL=1 pnpm smoke
```

Without provider variables, Webhook passes locally and Resend, SES, and both UploadFile checks skip. The first command succeeds; the second fails because skips count as failures. No dotenv file is loaded automatically. Invalid credentials fail rather than skip. Generic SMTP is covered by the in-process catcher, outside this smoke test.

Each channel submits a fresh Support Log with a 1×1 PNG through the built package's public exports. Webhook checks its signature and PNG. An external receiver must return 2xx; that mode verifies the outgoing signed body and HTTP acceptance, without claiming downstream processing. UploadFile requires an `Uploaded` Screenshot in each access mode, fetches the URL, checks HTTP 200, `image/png`, and exact bytes, then deletes the file. Cleanup also runs on failure and attempts deletion by Support Log custom ID when no file key was returned. A cleanup failure fails the channel; interrupted jobs or uploads still finishing remotely may need manual cleanup in the test app.

Resend requires relay acceptance, then polls [Retrieve Sent Email](https://resend.com/docs/api-reference/emails/retrieve-email) for up to 120 seconds. The script observes a clone of the real send response to recover the ID discarded by the public adapter. `delivered`, `opened`, or `clicked` passes; terminal failures, read errors, or timeout fail. The [full_access permission](https://resend.com/docs/api-reference/api-keys/create-api-key) is necessary for reads. SES checks provider acceptance only: neither SES acceptance nor Resend's delivery-to-mail-server event proves placement in the inbox. Check the controlled inbox for both messages when cutting a release.

## Cut v1.0.0

**TODO: Choose a license: add LICENSE + license field**

1. Configure secrets, npm access, the canonical `repository` metadata, and branch protection requiring CI. Run the all-provider smoke successfully and inspect the test inbox.
2. Review the single major Changeset for `shotlog` and verify `pnpm exec changeset status --verbose` plans **1.0.0**. Merge after review and CI. Confirm the resulting version PR actually says **1.0.0** before merging it. If the `GITHUB_TOKEN`-created PR does not trigger CI, a maintainer must arrange a CI run before merging.
3. Merge the Changesets version PR. Push CI runs layers 1–5; Release then runs the blocking smoke and publishes `latest` with provenance. Review the smoke table, npm version, dist-tag, and provenance after completion. The generated `CHANGELOG.md` is included in the npm package.

## Prerelease to next

On a green `main` with a pending Changeset for `shotlog`, dispatch **Release**, choose `tag: next`, leave `skip_smoke: false`, and enter a reason. The workflow checks that this exact commit passed CI, applies `changeset version --snapshot next` only in the runner, rebuilds, and publishes a `0.0.0-next-<timestamp>` snapshot using an explicit `--tag next`. It creates no Git tag and commits no snapshot changes. Install with `shotlog@next`. No production smoke or provider secrets are needed. An absent Changeset produces no snapshot and publication is refused. Changesets pre mode is deliberately rejected; use this dispatch so a first prerelease cannot implicitly acquire `latest`.

## Emergency provider-outage override

Only use this when a provider is down, after assessing the failed smoke result. Dispatch **Release** on `main` with `tag: latest`, `skip_smoke: true`, and a non-empty reason naming the affected provider and incident. This still requires successful CI for the exact current `main` commit, builds the package, and retains provenance. The job prints a warning and records **PRODUCTION SMOKE TEST BYPASSED**, the actor, and the reason prominently in its summary. Blank or whitespace-only reasons are rejected. The override skips the production smoke only; if Changesets are still pending, the workflow opens a version PR instead of publishing. Re-run the all-provider smoke after the outage is resolved.

## Production site deployment

Set the Vercel project's root directory to **`apps/site`**, with workspace files outside that directory available, and production branch to **`main`**. Its `vercel.json` disables automatic Git deployments from `main`; preview branches remain enabled ([Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration)).

The Release workflow's `deploy-site` job depends on a successful `latest` publication reported by Changesets. It checks out that exact release commit and runs `vercel deploy --prod` from the repository root, letting the configured Vercel project select `apps/site`. The server build includes the library and site. Version PR creation, no-op publication, `next` snapshots, failed smoke/publish, and emergency smoke overrides do not deploy the site. This keeps production site deployment behind a passed smoke test even when npm publication uses the emergency override.

Configure all three Vercel secrets above. If any are absent, the job emits a notice and skips deployment without failing the npm release. Review the deployment job and shotlog.dev after publication; deployment failure cannot roll back an already published npm version. Staging deployments and ordinary PR CI do not require real-provider smoke.
