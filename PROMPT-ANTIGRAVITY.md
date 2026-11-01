# Kapana Indian Restaurant: Optimized Build Prompt

> Copy everything inside the box below into your AI coding assistant (Claude Code, Cursor, etc.).
> Keep `PRD.md`, `WORKFLOW.md`, and `RULES.md` in the repo root so the assistant can read them.
> For best results, run the build in phases (see "Phased prompts" at the bottom) instead of all at once.

---

```text
# ROLE
You are a senior full-stack engineer and UI designer. You write production-quality,
typed, tested, accessible code and you follow the project documents exactly.

# CONTEXT
We are building the official website for "Kapana Indian Restaurant", a dynamic web app
with a public site (frontend) and a management backend. Restaurant staff must be able to
update menus, prices, carousel images and recommended dishes without touching code.
Read these files before writing any code and treat them as the source of truth:
- PRD.md       → features, data model, API, acceptance criteria
- WORKFLOW.md  → phases, branching, review and deploy process
- RULES.md     → coding standards and non-negotiable rules
If anything in this prompt conflicts with those files, the files win. If something is
unclear, list your assumption in ASSUMPTIONS.md and continue.

# GOAL
Deliver a working monorepo with:
1. A React frontend (public site + admin dashboard)
2. A REST API backend with a database
3. Seed data, tests, environment templates, and setup docs

# TECH STACK (do not substitute without asking)
Frontend: React 18 + TypeScript + Vite, React Router v6, TanStack Query, Tailwind CSS,
          Embla Carousel (or Swiper), React Hook Form + Zod, react-helmet-async, i18next
Backend:  Node.js 20 + Express + TypeScript, Prisma ORM, PostgreSQL, Zod validation,
          JWT auth (httpOnly cookie), Multer + Cloudinary (or S3) for images
Testing:  Vitest + React Testing Library (frontend), Vitest + Supertest (backend),
          Playwright (end-to-end smoke tests)
Tooling:  pnpm workspaces, ESLint, Prettier, Husky + lint-staged, Docker Compose for Postgres

# PUBLIC PAGES
1. Home  (/)
   - Full-width hero image carousel (autoplay 5s, pause on hover, swipe, dots + arrows,
     keyboard accessible, slides managed from admin, each slide: image, title, subtitle,
     optional CTA button + link)
   - "Today's Recommended" section: cards for items flagged isRecommended
     (image, name, short description, price, veg/non-veg badge, spice level)
   - Quick links to the three menus (Lunch, Takeout, Grand)
   - Opening hours + "Open now / Closed" live badge
   - Location block: address, phone, embedded Google Map
   - Google Reviews section: overall rating, total review count, up to 5 latest reviews
     (author name, photo, stars, relative time, text), "See all reviews on Google" link,
     required Google attribution
2. Menus  (/menu/lunch, /menu/takeout, /menu/grand)
   - Tabs or sub-nav to switch between the three menus
   - Items grouped by category (Starters, Curries, Tandoori, Biryani, Naan & Rice,
     Desserts, Drinks, Lunch Sets, etc.) with sticky category navigation
   - Filters: Vegetarian, Vegan, Halal, Gluten-free, spice level; text search
   - Lunch menu shows its serving hours and a notice when outside lunch time
   - Takeout menu shows pickup info and a "Call to order" button (tel: link)
   - Item card: image (lazy-loaded), name, description, price, dietary tags,
     allergens, spice level (0–3 chilies), "Recommended" ribbon, "Sold out" state
3. Contact  (/contact)
   - Small gallery carousel of the restaurant interior/food
   - Address, phone, email, opening hours table, holiday notice
   - Interactive Google Map with marker and "Get directions" link
   - Google Reviews summary (rating + 3 reviews + link)
   - Contact / reservation enquiry form (name, email, phone, date, guests, message)
     with validation, honeypot spam field, rate limiting, success/error states
4. 404 page and a global error boundary

# ADMIN DASHBOARD (/admin, protected)
- Login (email + password), logout, session expiry
- CRUD: menus, categories, menu items (drag-to-reorder), carousel slides, restaurant
  settings (name, address, phone, hours, holidays, social links, Google place_id)
- Toggle item flags: recommended, sold out, active
- Image upload with client-side preview and server-side size/type checks
- View and mark contact messages as read
- Roles: ADMIN (everything), STAFF (menus, items, sold-out toggles only)

# BACKEND API
Implement every endpoint listed in PRD.md section 8 under /api/v1, with Zod validation,
consistent JSON error format { error: { code, message, details? } }, pagination where
listed, and OpenAPI docs served at /api/docs.

Google integrations:
- Reviews: backend proxies Google Places API (New) "Place Details" using place_id from
  settings. Never expose the API key to the browser. Respect Google Maps Platform terms:
  store only place_id permanently, use short-lived in-memory caching only, always show
  Google attribution and the review author attribution.
- Map: use the Maps Embed API (iframe) by default; Maps JavaScript API is optional.
  Use a separate, HTTP-referrer-restricted browser key for maps.

# DESIGN DIRECTION
- Warm, appetizing, modern Indian aesthetic: deep saffron, turmeric, cardamom green,
  charcoal and cream. Define them as Tailwind theme tokens; do not hard-code hex values.
- Display serif for headings, clean sans-serif for body. Generous whitespace,
  large food photography, subtle motion (respect prefers-reduced-motion).
- Mobile-first. Sticky header with logo, nav, language switch (EN / JA), and a
  "Call" button on mobile. Footer with hours, address, socials.

# NON-FUNCTIONAL REQUIREMENTS
- Lighthouse ≥ 90 for Performance, Accessibility, Best Practices, SEO (mobile)
- WCAG 2.1 AA: semantic HTML, alt text, focus states, contrast, carousel controls
- SEO: per-page meta tags, Open Graph, sitemap.xml, robots.txt, schema.org
  "Restaurant" + "Menu" JSON-LD generated from live data
- Security: helmet, CORS allow-list, rate limiting, bcrypt passwords, input validation,
  no secrets in the repo, parameterized queries via Prisma only
- Images: responsive sizes, WebP/AVIF, lazy-loading, width/height to avoid layout shift

# DELIVERABLES
1. Folder structure as in PRD.md section 10
2. Prisma schema + migrations + seed script with realistic sample Indian dishes
   (at least 8 lunch items, 10 takeout items, 30 grand-menu items, 4 carousel slides)
3. .env.example for frontend and backend with every variable documented
4. README.md with setup, run, test, build and deploy instructions
5. Tests meeting the coverage targets in RULES.md
6. ASSUMPTIONS.md listing every assumption you made

# OUTPUT FORMAT
- Work phase by phase as defined in WORKFLOW.md. At the end of each phase, print:
  (a) files created/changed, (b) how to run/verify, (c) open questions.
- Output complete files, never "// ...rest of code" placeholders.
- Do not move to the next phase until the current phase's checklist passes.

# ACCEPTANCE
The build is done when every acceptance criterion in PRD.md section 12 passes,
`pnpm lint && pnpm test && pnpm build` succeeds, and the Playwright smoke test passes.
```

---

## Phased prompts

Use these one at a time after pasting the master prompt once.

1. **Phase 1 (Foundation):** "Execute Phase 1 from WORKFLOW.md: monorepo scaffold, tooling, Docker Postgres, Prisma schema, migrations and seed data. Stop and report."
2. **Phase 2 (API):** "Execute Phase 2: implement all public and admin API endpoints with validation, auth, tests and OpenAPI docs. Stop and report."
3. **Phase 3 (Public site):** "Execute Phase 3: layout, Home, Menus and Contact pages wired to the API, including carousels, map and reviews. Stop and report."
4. **Phase 4 (Admin):** "Execute Phase 4: admin dashboard with login, CRUD screens, image upload, reorder and roles. Stop and report."
5. **Phase 5 (Quality):** "Execute Phase 5: SEO, i18n, accessibility and performance passes, E2E tests, and deployment config. Stop and report."

## Tips for better results

- Paste real data early (actual dish names, prices, hours, address, Google place_id) so the seed matches your restaurant.
- Add 3–5 real photos to `/frontend/public/seed-images` before Phase 3.
- If output drifts from the design, say: "Re-read the DESIGN DIRECTION and RULES.md section 3 and fix the styling."
