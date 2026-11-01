# Kapana: Development Workflow

This file defines how the project is built, reviewed, released and maintained. Humans and AI assistants follow the same process.

---

## 1. Phase plan

Each phase ends with a checklist. Do not start the next phase until every box is checked.

### Phase 1: Foundation
- [ ] pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`, `e2e`
- [ ] TypeScript strict mode everywhere; shared `tsconfig.base.json`
- [ ] ESLint + Prettier + Husky + lint-staged + commitlint
- [ ] `docker-compose.yml` with Postgres 16 (and Adminer)
- [ ] Prisma schema from PRD §7, first migration, `seed.ts` with sample data
- [ ] `.env.example` files; README "Getting started"
- [ ] CI workflow: install → lint → typecheck → test → build
- **Verify:** `pnpm i && docker compose up -d && pnpm db:migrate && pnpm db:seed` succeeds.

### Phase 2: Backend API
- [ ] Express app: helmet, CORS allow-list, JSON limit, request ID, pino logger
- [ ] Error middleware with standard error shape
- [ ] Zod schemas in `packages/shared`, used by both API validation and the web forms
- [ ] Public endpoints (PRD §8) + caching headers
- [ ] Auth (login/logout/me), RBAC middleware, account lockout
- [ ] Admin CRUD, reorder, bulk, uploads, audit log
- [ ] Google reviews proxy with in-memory TTL cache and failure fallback
- [ ] Rate limiting on `/contact` and `/auth/login`
- [ ] OpenAPI docs at `/api/docs`
- [ ] Supertest tests for every endpoint, including 401/403 cases
- **Verify:** `pnpm --filter api test` green; `/api/docs` loads.

### Phase 3: Public frontend
- [ ] Tailwind theme tokens, fonts, base UI components
- [ ] Router, layout (header, footer, open-now badge), error boundary, 404
- [ ] API client + TanStack Query hooks
- [ ] Home: hero carousel, recommended, menu shortcuts, hours/location/map, reviews
- [ ] Menu pages: tabs, sticky categories, filters, search, item cards, lunch/takeout notices
- [ ] Contact: gallery carousel, info, map, reviews summary, enquiry form
- [ ] Loading skeletons, empty and error states for every data section
- [ ] Component tests for carousel, filters, form
- **Verify:** all public pages work against the seeded API on mobile and desktop widths.

### Phase 4: Admin dashboard
- [ ] Login page, protected routes, session handling
- [ ] Dashboard overview + quick toggles
- [ ] CRUD screens: menus, categories, items (with variants), carousel, settings, messages, users
- [ ] Drag-and-drop ordering, image upload with preview
- [ ] Role-based UI hiding (and server enforcement already in place)
- [ ] Toast feedback, confirm dialogs for deletes, unsaved-changes guard
- **Verify:** a STAFF user can toggle sold-out on a phone in under 10 seconds.

### Phase 5: Quality and launch
- [ ] i18n EN/JA complete; language switcher persists
- [ ] SEO: meta, OG, sitemap, robots, JSON-LD
- [ ] Accessibility audit (axe + manual keyboard + screen reader pass)
- [ ] Performance pass (image sizes, code splitting, preload hero, font-display)
- [ ] Playwright smoke: home → menu filter → contact submit → admin login → toggle item
- [ ] Production env vars, domain, HTTPS, Google key restrictions, backups, monitoring
- [ ] Real content entered and owner sign-off
- **Verify:** PRD §12 acceptance criteria all pass.

---

## 2. Git workflow

### Branches
| Branch | Purpose |
|---|---|
| `main` | Always deployable; production deploys from here |
| `develop` | Integration branch; deploys to staging |
| `feature/<ticket>-<short-name>` | New features, from `develop` |
| `fix/<ticket>-<short-name>` | Bug fixes, from `develop` |
| `hotfix/<short-name>` | Urgent production fixes, from `main`, merged back to both |

### Commits (Conventional Commits)
```
feat(menu): add spice level filter
fix(api): return 403 for staff on settings update
chore(deps): bump prisma to 5.x
docs(prd): clarify lunch serving hours
test(contact): cover honeypot rejection
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.

### Pull requests
1. Open PR to `develop` with the template: *What / Why / How to test / Screenshots / Checklist*.
2. CI must pass (lint, typecheck, tests, build, bundle-size check).
3. At least one review approval. AI-generated code is reviewed like human code.
4. Squash-merge; delete branch.

### PR checklist
- [ ] Follows `RULES.md`
- [ ] Tests added/updated; coverage not reduced
- [ ] No secrets, no `console.log`, no commented-out code
- [ ] Mobile and desktop screenshots for UI changes
- [ ] Accessible (keyboard, labels, contrast)
- [ ] Migration included if the schema changed; seed updated
- [ ] Docs updated (PRD/README/OpenAPI) if behavior changed

---

## 3. Environments

| Env | Branch | Web | API | DB |
|---|---|---|---|---|
| Local | any | `localhost:5173` | `localhost:4000` | Docker Postgres |
| Staging | `develop` | preview URL | staging API | staging DB (seeded) |
| Production | `main` | custom domain | prod API | prod DB (backed up daily) |

Secrets live only in the hosting provider's environment settings and a password manager.

---

## 4. CI/CD pipeline

```
push / PR
  └─ install (pnpm, cached)
     ├─ lint + prettier check
     ├─ typecheck
     ├─ unit + integration tests (Postgres service container)
     ├─ build web + api
     ├─ bundle-size check (public < 200 KB gzip)
     └─ (develop/main) Playwright smoke vs. preview
merge to develop → deploy staging → run migrations → smoke test
merge to main    → deploy production → run migrations → smoke test → tag release (vX.Y.Z)
```

Rollback: redeploy the previous release tag; database migrations must be backward-compatible for one release.

---

## 5. Content workflow (restaurant staff)

```
Owner/Staff logs in ─► edits item / slide / hours ─► Save
        │                                            │
        │                                  API validates + audit log
        │                                            │
        └────────── sees change live on site ◄── cache invalidated (≤ 60 s)
```

| Task | Who | Where | Frequency |
|---|---|---|---|
| Mark item sold out / back | Staff | Admin → Items (quick toggle) | Daily |
| Change recommended dishes | Staff | Admin → Dashboard | Weekly |
| Update prices | Admin | Admin → Items | As needed |
| Add seasonal carousel slide | Admin | Admin → Carousel (with schedule) | Monthly |
| Add holiday closure | Admin | Admin → Settings → Holidays | As needed |
| Reply to enquiries | Admin | Admin → Messages (reply via email) | Daily |
| Review menu accuracy | Owner | Public site | Monthly |

---

## 6. Request flows

**Menu page load**
```
Browser → GET /api/v1/menus/grand?lang=ja
API → Prisma (menu + categories + active items, ordered) → JSON (Cache-Control: max-age=60)
Web → TanStack Query cache → render categories → client-side filters
```

**Google reviews**
```
Browser → GET /api/v1/reviews
API → memory cache hit? return
    → miss: Places API (server key) → normalize → cache (TTL ≤ 1 h) → return
    → Google error: return { available: false } → UI shows link-only fallback
```

**Contact enquiry**
```
Form (Zod) → POST /api/v1/contact → rate limit → honeypot → Zod → save → optional email → 201
```

---

## 7. Release and maintenance
- **Versioning:** SemVer; changelog generated from commits.
- **Monitoring:** uptime check on `/api/v1/health`; error tracking (Sentry); Google API billing alert.
- **Backups:** daily automated DB backup, monthly restore test.
- **Dependencies:** Renovate/Dependabot weekly; security patches within 7 days.
- **Content audit:** monthly owner review of menus, hours and photos.
