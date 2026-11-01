# Product Requirements Document: Kapana Indian Restaurant Web App

| Field | Value |
|---|---|
| Product | Kapana Indian Restaurant website + admin dashboard |
| Version | 1.0 |
| Status | Draft for review |
| Owner | Restaurant owner / Product lead |
| Last updated | 2026-10-08 |

---

## 1. Overview

Kapana needs a fast, attractive, mobile-first website that shows its three menus (Lunch, Takeout, Grand), builds trust through Google reviews, and helps customers find, call and visit the restaurant. Staff must be able to update menus, prices, sold-out status, photos and recommendations themselves through a simple admin dashboard.

## 2. Goals and success metrics

| Goal | Metric | Target (90 days after launch) |
|---|---|---|
| Drive visits | "Get directions" clicks | +30% vs. baseline |
| Drive takeout orders | "Call to order" taps | 15+ per day |
| Fast experience | Lighthouse mobile performance | ≥ 90 |
| Self-service content | Menu changes made by staff without a developer | 100% |
| Enquiries | Contact/reservation form submissions | 5+ per week |
| Discoverability | Google Search impressions for "Indian restaurant near me" queries | Upward trend month over month |

### Non-goals (v1)
Online payment, delivery integration, table-booking engine with live availability, loyalty program, native mobile apps. These are listed in section 14 as future scope.

## 3. Users and personas

| Persona | Needs |
|---|---|
| **Lunch-break worker** | See today's lunch sets and prices quickly on a phone, know if lunch is still being served. |
| **Takeout customer** | Browse the takeout menu, check dietary info, tap to call and order. |
| **Dinner guest / tourist** | Explore the full grand menu, read reviews, find the location, switch to English or Japanese. |
| **Restaurant staff** | Mark items sold out, change daily recommendations, in seconds, from a phone. |
| **Owner / admin** | Manage all content, hours, holidays, photos, staff accounts; read enquiries. |

## 4. Scope summary

| Area | In scope v1 |
|---|---|
| Public site | Home, Lunch menu, Takeout menu, Grand menu, Contact, 404 |
| Content | Carousel slides, menus, categories, items, settings, recommended items |
| Integrations | Google Maps (embed), Google Places reviews (via backend proxy) |
| Admin | Auth, roles, CRUD, image upload, reorder, sold-out toggle, messages inbox |
| Languages | English and Japanese (menu item fields stored in both) |

## 5. Functional requirements: public site

### 5.1 Global layout
- **FR-G1** Sticky header: logo, nav (Home, Lunch, Takeout, Grand Menu, Contact), language switcher, mobile hamburger, mobile "Call" button.
- **FR-G2** Footer: address, phone, hours summary, social icons, copyright.
- **FR-G3** "Open now / Closed / Opens at HH:MM" badge computed from settings and the restaurant timezone, including holidays.
- **FR-G4** Global error boundary and friendly 404 page.

### 5.2 Home page `/`
- **FR-H1 Hero carousel**: slides from `GET /carousel?placement=HOME`. Autoplay every 5 s, pause on hover/focus, swipe on touch, previous/next arrows, dot indicators, keyboard arrows, `aria-roledescription="carousel"`, autoplay disabled when `prefers-reduced-motion`. Each slide: image, title, subtitle, optional CTA (label + link). First slide image is eager-loaded; others lazy.
- **FR-H2 Recommended items**: up to 8 cards from `GET /menu-items?recommended=true`, horizontally scrollable on mobile, grid on desktop. Card shows image, name, short description, price, dietary badges, spice level, and links to the item on its menu page.
- **FR-H3 Menu shortcuts**: three large cards linking to Lunch, Takeout and Grand menus with serving times.
- **FR-H4 Hours & location**: hours table, address, phone (tel link), embedded Google Map, "Get directions" link.
- **FR-H5 Google reviews**: overall rating (stars + number), total count, up to 5 reviews (author name, profile photo, rating, relative time, text clamped to 4 lines with "Read more"), "See all reviews on Google" link, Google attribution. If the API fails, the section hides gracefully and shows only the "Read our reviews on Google" link.
- **FR-H6** About/story teaser block (text + image from settings).

### 5.3 Menu pages `/menu/:type` (`lunch` | `takeout` | `grand`)
- **FR-M1** Tabbed switcher between the three menus; URL updates; deep links work.
- **FR-M2** Items grouped by category in admin-defined order; sticky horizontal category nav with scroll-spy.
- **FR-M3** Filters (Vegetarian, Vegan, Halal, Gluten-free, spice 0–3) and text search; filters reflected in URL query string.
- **FR-M4** Item card: image, name, description, price (formatted in configured currency), dietary tags, allergen list, spice icons, "Recommended" ribbon, "Sold out" overlay (item still visible, greyed).
- **FR-M5 Lunch**: shows serving window (e.g., 11:00–15:00, weekdays) and a banner when currently outside lunch hours.
- **FR-M6 Takeout**: shows pickup notes, packaging fee if any, and a prominent "Call to order" button.
- **FR-M7 Grand**: full dine-in menu; supports item variants (e.g., Half / Full, Chicken / Lamb / Paneer) with separate prices.
- **FR-M8** Empty state when filters return nothing; skeleton loaders during fetch.
- **FR-M9** Optional "Print / Download PDF" link per menu if a PDF is uploaded in admin.

### 5.4 Contact page `/contact`
- **FR-C1** Gallery carousel (`placement=CONTACT`), same accessibility rules as FR-H1.
- **FR-C2** Address, phone, email, full weekly hours, upcoming holiday closures.
- **FR-C3** Google Map (embed iframe, lazy-loaded) with marker; "Get directions" deep link to Google Maps.
- **FR-C4** Reviews summary: rating, count, 3 reviews, link to Google.
- **FR-C5** Enquiry form: name*, email*, phone, enquiry type (General / Reservation / Catering / Feedback), preferred date, number of guests, message*. Client + server validation, honeypot field, rate limit (5 per IP per hour), success and error states, accessible error messages.
- **FR-C6** Admin receives the message in the dashboard; optional email notification via SMTP/Resend.

## 6. Functional requirements: admin dashboard `/admin`

- **FR-A1 Auth**: email + password login, JWT in httpOnly secure cookie, 8 h session, logout, lockout after 10 failed attempts in 15 min.
- **FR-A2 Roles**: `ADMIN` full access; `STAFF` can edit items, toggle sold-out/recommended, cannot edit settings, users or delete menus.
- **FR-A3 Dashboard home**: counts (items, sold-out items, unread messages), quick toggles for today's recommended and sold-out.
- **FR-A4 Menus**: edit name, description, serving hours, active flag, PDF upload per menu type.
- **FR-A5 Categories**: CRUD, drag-and-drop ordering, assign to one or more menus.
- **FR-A6 Menu items**: CRUD with fields from section 7, image upload (JPEG/PNG/WebP, ≤ 5 MB, auto-resized), variants, drag reorder, bulk sold-out toggle, duplicate item.
- **FR-A7 Carousel**: CRUD slides per placement (HOME, CONTACT), reorder, schedule (startAt/endAt), active flag.
- **FR-A8 Settings**: restaurant name, address, coordinates, phone, email, timezone, currency, weekly hours, holidays, social links, Google place_id, about text.
- **FR-A9 Messages**: list, filter (unread/all/type), mark read, delete.
- **FR-A10 Users** (ADMIN only): invite/create staff, reset password, deactivate.
- **FR-A11** Every write action is recorded in an audit log (who, what, when).
- **FR-A12** Changes appear on the public site within 60 seconds (cache invalidation on write).

## 7. Data model

```prisma
enum Role        { ADMIN STAFF }
enum MenuType    { LUNCH TAKEOUT GRAND }
enum Placement   { HOME CONTACT }
enum EnquiryType { GENERAL RESERVATION CATERING FEEDBACK }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role     @default(STAFF)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Menu {
  id           String     @id @default(cuid())
  type         MenuType   @unique
  nameEn       String
  nameJa       String?
  descriptionEn String?
  descriptionJa String?
  servingHours Json?      // [{ day: 1, open: "11:00", close: "15:00" }]
  notesEn      String?    // e.g. pickup info for takeout
  notesJa      String?
  pdfUrl       String?
  isActive     Boolean    @default(true)
  categories   MenuCategory[]
}

model Category {
  id        String   @id @default(cuid())
  nameEn    String
  nameJa    String?
  sortOrder Int      @default(0)
  menus     MenuCategory[]
  items     MenuItem[]
}

model MenuCategory {            // many-to-many Menu <-> Category
  menuId     String
  categoryId String
  sortOrder  Int @default(0)
  menu       Menu     @relation(fields: [menuId], references: [id], onDelete: Cascade)
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  @@id([menuId, categoryId])
}

model MenuItem {
  id            String   @id @default(cuid())
  categoryId    String
  category      Category @relation(fields: [categoryId], references: [id])
  menuTypes     MenuType[]           // an item can appear on several menus
  nameEn        String
  nameJa        String?
  descriptionEn String?
  descriptionJa String?
  price         Int                  // minor units (e.g. yen); never float
  variants      ItemVariant[]
  imageUrl      String?
  spiceLevel    Int      @default(0) // 0–3
  isVegetarian  Boolean  @default(false)
  isVegan       Boolean  @default(false)
  isHalal       Boolean  @default(false)
  isGlutenFree  Boolean  @default(false)
  allergens     String[]             // ["milk","nuts","wheat",...]
  isRecommended Boolean  @default(false)
  isSoldOut     Boolean  @default(false)
  isActive      Boolean  @default(true)
  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([categoryId, sortOrder])
}

model ItemVariant {
  id        String   @id @default(cuid())
  itemId    String
  item      MenuItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  labelEn   String   // "Half", "Lamb"
  labelJa   String?
  price     Int
  sortOrder Int      @default(0)
}

model CarouselSlide {
  id         String    @id @default(cuid())
  placement  Placement
  imageUrl   String
  altEn      String
  altJa      String?
  titleEn    String?
  titleJa    String?
  subtitleEn String?
  subtitleJa String?
  ctaLabelEn String?
  ctaLabelJa String?
  ctaLink    String?
  sortOrder  Int       @default(0)
  startAt    DateTime?
  endAt      DateTime?
  isActive   Boolean   @default(true)
}

model Settings {                 // single row, id = "default"
  id           String @id @default("default")
  name         String
  addressEn    String
  addressJa    String?
  lat          Float
  lng          Float
  phone        String
  email        String
  timezone     String  @default("Asia/Tokyo")
  currency     String  @default("JPY")
  weeklyHours  Json    // [{ day: 0-6, open: "11:00", close: "22:00", closed: false }]
  holidays     Json    // [{ date: "2026-12-31", note: "New Year" }]
  socials      Json    // { instagram, facebook, x, tiktok }
  googlePlaceId String?
  aboutEn      String?
  aboutJa      String?
  updatedAt    DateTime @updatedAt
}

model ContactMessage {
  id        String      @id @default(cuid())
  name      String
  email     String
  phone     String?
  type      EnquiryType @default(GENERAL)
  date      DateTime?
  guests    Int?
  message   String
  isRead    Boolean     @default(false)
  ip        String?
  createdAt DateTime    @default(now())
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String   // "item.update"
  entity    String
  entityId  String
  diff      Json?
  createdAt DateTime @default(now())
}
```

## 8. API specification (base `/api/v1`)

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/settings/public` | Name, address, coordinates, phone, hours, holidays, socials, open-now status |
| GET | `/menus` | List active menus with serving hours |
| GET | `/menus/:type` | One menu with categories and items (`?veg=&vegan=&halal=&gf=&spice=&q=&lang=`) |
| GET | `/menu-items?recommended=true&limit=8` | Recommended items |
| GET | `/carousel?placement=HOME\|CONTACT` | Active, in-schedule slides ordered |
| GET | `/reviews` | Proxied Google rating, count and up to 5 reviews (cached ≤ 1 h in memory) |
| POST | `/contact` | Submit enquiry (validated, rate-limited, honeypot) |
| GET | `/health` | Liveness check |

### Admin (auth required)

| Method | Path | Role |
|---|---|---|
| POST | `/auth/login`, `/auth/logout`; GET `/auth/me` | Any |
| GET/POST/PATCH/DELETE | `/admin/menus[/:id]` | ADMIN (PATCH: STAFF) |
| GET/POST/PATCH/DELETE | `/admin/categories[/:id]` | ADMIN |
| PATCH | `/admin/categories/reorder` | ADMIN |
| GET/POST/PATCH/DELETE | `/admin/items[/:id]` | STAFF+ (DELETE: ADMIN) |
| PATCH | `/admin/items/reorder`, `/admin/items/bulk` | STAFF+ |
| GET/POST/PATCH/DELETE | `/admin/carousel[/:id]` | ADMIN |
| POST | `/admin/uploads` (multipart) | STAFF+ |
| GET/PATCH | `/admin/settings` | ADMIN |
| GET/PATCH/DELETE | `/admin/messages[/:id]` | ADMIN |
| GET/POST/PATCH | `/admin/users[/:id]` | ADMIN |
| GET | `/admin/audit-logs` | ADMIN |

### Conventions
- JSON only; dates ISO 8601 UTC; money as integer minor units.
- Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }`.
- Pagination: `?page=1&pageSize=20` → `{ data, page, pageSize, total }`.
- OpenAPI 3 document at `/api/docs`.

## 9. Integrations

### 9.1 Google Maps
- Default: **Maps Embed API** iframe (`place` mode with `place_id`), lazy-loaded, `title` attribute set, no JS cost.
- "Get directions": `https://www.google.com/maps/dir/?api=1&destination_place_id=...`.
- Browser key restricted by HTTP referrer and to the Maps Embed API only.

### 9.2 Google Reviews
- Backend calls **Places API (New) Place Details** with field mask `rating,userRatingCount,reviews,googleMapsUri`.
- Server-side key, restricted by IP and to Places API; never sent to the browser.
- Only `place_id` is stored permanently. Review content is held in a short-lived in-memory cache to protect quota; follow the current Google Maps Platform Terms on caching and attribution.
- Display: Google attribution, author name and photo linking to author profile, relative time as provided.
- Note: the API returns at most 5 reviews, chosen by Google. The UI must not claim they are "all" reviews.

### 9.3 Images
- Cloudinary (or S3 + CloudFront). Upload via backend; generate responsive variants (400/800/1600 px, WebP/AVIF).

### 9.4 Email (optional)
- Resend or SMTP for new-enquiry notifications to the owner.

## 10. Architecture and folder structure

```
kapana/
├─ apps/
│  ├─ web/                    # React + Vite
│  │  ├─ src/
│  │  │  ├─ app/              # router, providers, layout
│  │  │  ├─ pages/            # Home, Menu, Contact, NotFound, admin/*
│  │  │  ├─ features/         # menu/, carousel/, reviews/, contact/, admin/
│  │  │  ├─ components/ui/    # Button, Card, Badge, Tabs, Modal...
│  │  │  ├─ hooks/  lib/  i18n/  styles/
│  │  │  └─ main.tsx
│  │  └─ public/
│  └─ api/                    # Express
│     ├─ src/
│     │  ├─ modules/          # menus/, items/, carousel/, reviews/, contact/, auth/, settings/
│     │  │   └─ <module>.{routes,controller,service,schema}.ts
│     │  ├─ middleware/       # auth, rbac, error, rateLimit, validate
│     │  ├─ lib/              # prisma, logger, cache, google
│     │  └─ server.ts
│     └─ prisma/              # schema.prisma, migrations/, seed.ts
├─ packages/
│  └─ shared/                 # Zod schemas + TS types shared by web & api
├─ e2e/                       # Playwright
├─ docker-compose.yml
├─ PRD.md  WORKFLOW.md  RULES.md  PROMPT.md  README.md
└─ pnpm-workspace.yaml
```

**Backend alternative (low-ops option):** replace `apps/api` with Supabase (Postgres + Auth + Storage + Edge Function for Google reviews). The frontend stays identical; only `lib/api.ts` changes. Choose this if no one will maintain a Node server.

**Hosting:** Web on Vercel/Netlify/Cloudflare Pages; API on Render/Railway/Fly.io; Postgres on Neon/Supabase/Railway.

## 11. Non-functional requirements

| Category | Requirement |
|---|---|
| Performance | LCP < 2.5 s, CLS < 0.1, INP < 200 ms on 4G mid-range phone; JS bundle for public pages < 200 KB gzip; admin code-split |
| Accessibility | WCAG 2.1 AA; full keyboard use; carousel pause control; contrast ≥ 4.5:1 |
| SEO | Unique title/description per page, OG tags, canonical, sitemap.xml, robots.txt, JSON-LD `Restaurant` (address, geo, hours, servesCuisine, menu) and `Menu`/`MenuItem` |
| i18n | EN/JA UI strings and content; `lang` attribute; language persisted per visitor |
| Security | OWASP Top 10 mitigations; helmet; CORS allow-list; rate limits; bcrypt (cost 12); secure cookies; upload type sniffing; dependency audit in CI |
| Reliability | 99.5% uptime; daily DB backups, 7-day retention; graceful degradation when Google APIs fail |
| Privacy | Privacy policy page; enquiry data retained 12 months then purged; no tracking cookies without consent |
| Browser support | Last 2 versions of Chrome, Safari (iOS), Edge, Firefox |

## 12. Acceptance criteria (definition of done for v1)

1. All three menu pages render seeded data, filters and search work, URLs are shareable.
2. Home hero carousel autoplays, pauses on hover/focus, works by swipe and keyboard, respects reduced motion.
3. Recommended section shows only active, recommended items; toggling in admin updates the site within 60 s.
4. Google Map shows the correct location; "Get directions" opens Google Maps.
5. Reviews section shows rating, count, ≤ 5 reviews with attribution; hides gracefully on API failure.
6. Contact form validates on client and server, blocks honeypot submissions, rate-limits, and messages appear in admin.
7. STAFF cannot access settings, users, or delete endpoints (verified by tests returning 403).
8. Sold-out items show the sold-out state and cannot be mistaken for available.
9. Lighthouse mobile ≥ 90 in all four categories on Home and Grand menu.
10. axe-core reports zero critical/serious issues on all public pages.
11. `pnpm lint`, `pnpm test`, `pnpm build`, and Playwright smoke tests pass in CI.

## 13. Milestones

| Milestone | Content | Est. duration |
|---|---|---|
| M1 Foundation | Repo, tooling, DB schema, seed | 3 days |
| M2 API | All endpoints, auth, tests, docs | 5 days |
| M3 Public site | Layout, Home, Menus, Contact, integrations | 6 days |
| M4 Admin | Dashboard, CRUD, uploads, roles | 6 days |
| M5 Quality & launch | SEO, i18n, a11y, perf, E2E, deploy, content entry | 4 days |

## 14. Future scope (v2+)
Online ordering with payment (Stripe / PayPay), delivery platform links, live table reservations, newsletter, loyalty points, daily specials push notifications, analytics dashboard, PWA install.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Google API cost / quota | Server proxy + in-memory cache + billing alerts |
| Google terms violation | Store only place_id, show attribution, follow current ToS |
| Poor photos hurt conversion | Budget a food photo shoot before launch |
| Staff don't update content | Mobile-friendly admin, one-tap sold-out toggles, short training |
| Menu prices out of date | "Last updated" date in admin; monthly review reminder |

## 16. Open questions
1. Final restaurant address, phone, hours and Google place_id?
2. Is a Japanese translation of every dish required at launch?
3. Is takeout ordered only by phone in v1, or also via a form?
4. Which image host (Cloudinary vs S3) and which hosting provider?
5. Brand assets: logo files, brand colors, fonts?
