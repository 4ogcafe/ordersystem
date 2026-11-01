# Kapana Indian Restaurant: Project Docs

| File | Purpose |
|---|---|
| [PROMPT-ANTIGRAVITY.md](./PROMPT-ANTIGRAVITY.md) | Master prompt + phased prompts for your AI coding tool |
| [docs/PRD.md](./docs/PRD.md) | Product requirements: features, data model, API, integrations, acceptance criteria |
| [docs/WORKFLOW.md](./docs/WORKFLOW.md) | Build phases with checklists, Git/PR flow, CI/CD, content and request flows |
| [.agents/rules/](./.agents/rules/) | Mandatory coding, design, accessibility, security, Google and testing rules |

## How to use
1. Create an empty repo and copy these four files into the root.
2. Fill in the open questions in `PRD.md` §16 (address, phone, hours, Google place_id, brand colors).
3. Paste the master prompt from `PROMPT.md` into your AI coding assistant.
4. Run the phased prompts one at a time, checking each phase's checklist in `WORKFLOW.md`.
5. Before launch, confirm every item in `PRD.md` §12.

## Getting started
1. `pnpm install`
2. Copy `apps/api/.env.example` to `apps/api/.env` and set `JWT_SECRET`.
3. Start MongoDB, then create an admin account (there is no default login):
   `ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long passphrase' pnpm --filter api create-admin`
4. `pnpm dev`: the API runs on :4000 and the site on :5173 (Vite proxies `/api` and `/uploads`).

| Command | Purpose |
|---|---|
| `pnpm --filter api typecheck` | Type-check the API |
| `pnpm --filter api test` | API integration tests (needs MongoDB; set `TEST_DATABASE_URL`, default `mongodb://127.0.0.1:27018/kalpana_test`, which is dropped on each run) |
| `pnpm --filter web lint` / `build` | Lint / production build of the site |

**Deploying:** serve the site and API from the same site (e.g. `example.com` + `api.example.com`) so the `SameSite=Strict` admin cookie is sent, set `NODE_ENV=production`, `JWT_SECRET`, `CORS_ORIGINS`, `TRUST_PROXY`, and `VITE_API_URL` at build time if the API is on another origin. Configure the static host to rewrite unknown paths to `index.html`.
