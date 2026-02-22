# Deploying the ANCHR website

## Screaming Frog / technical SEO alignment

The site is aligned with Screaming Frog SEO Spider expectations:

- **Security:** HTTPS canonical/og URLs; HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy (see headers below). All external links use `rel="noopener noreferrer"` with `target="_blank"`.
- **Page titles:** One title, in head, 30–60 chars.
- **Meta description:** One description, 70–155 chars.
- **H1:** Single H1 in main content; sections use H2.
- **Canonical:** Absolute HTTPS URL in `<head>`.
- **Images:** Three screenshots in the Demo section and one in the Install section (from `docs/media/`, copied to `public/`); all have descriptive `alt` text. OG image and favicon are meta/link only.
- **Structured data:** JSON-LD SoftwareApplication in head.
- **Sitemap & robots:** `robots.txt` and `sitemap.xml` in `public/`.
- **Accessibility:** Skip link (“Skip to main content”), semantic `<main id="main-content">`, viewport set.

Run a crawl after deploy and fix any host-specific issues (e.g. redirect chains, 4xxs).

**Demo section:** "Open anchr-demo-monorepo" points to the in-repo tree (`https://github.com/arcsight-ai/anchr/tree/main/anchr-demo-monorepo`), so it never 404s. VERIFIED PR and BLOCKED PR links are hidden until you set `DEMO_VERIFIED_PR_URL` and `DEMO_BLOCKED_PR_URL` in `website/src/App.jsx` to real PR URLs (after creating the standalone repo with `./scripts/prepare-demo-repo.sh` and opening the two PRs).

## SEO & URL

- **Canonical base URL** is set to `https://anchr.sh`. If you deploy elsewhere, replace it in **all** of these places:

  | File | What to replace |
  |------|------------------|
  | `website/index.html` | `canonical` href, `og:url`, `og:image`, `twitter:image` (4 occurrences), and the `url` in the JSON-LD script |
  | `website/public/robots.txt` | The `Sitemap:` line |
  | `website/public/sitemap.xml` | The `<loc>` value |
  | `website/index.html` (comment) | The comment that says "Replace https://anchr.sh with your deployed URL" |
  - Search the `website/` folder for `anchr.sh` to catch any others.

## HTTPS

- **Vercel / Netlify / GitHub Pages** serve over HTTPS by default and redirect HTTP → HTTPS.
- Security headers (HSTS, X-Content-Type-Options, etc.) are set via:
  - **Netlify:** `public/_headers`
  - **Vercel:** `vercel.json`

## Rendering and heading flicker prevention

**Stack:** Vite + React. Client-only (no SSR, no Next.js). No hydration mismatch possible.

**Why headings must not flicker:** Minimal, typography-led design makes any layout shift very visible. The following is in place so the hero and section headings do not resize or reflow after load:

1. **No webfont** — System font stack only (`-apple-system`, `BlinkMacSystemFont`, etc.). No font file loads, so there is no fallback → custom font metric swap.
2. **Critical CSS in `<head>`** — Inline block in `index.html` sets `:root`, `body`, `.container`, `.section`, and **fixed rem** for `h1`, `h2`, `h3` (with matching `@media` for 768px and 480px). These rules apply as soon as the HTML is parsed, before any script runs.
3. **Fixed rem only (no clamp)** — All heading sizes are static rem (e.g. `h1: 2.75rem`; overrides at 768px and 480px). No viewport-based `clamp()` or `vw`, so no recalculation on resize or after paint.
4. **No JS typography** — No `useEffect` or other script changes heading size, weight, or classes after mount.
5. **`#root` background** — `var(--bg)` on `#root` so the shell is never white before React paints.

**Critical CSS must match production CSS exactly.** The inline block in `index.html` duplicates the h1/h2/h3 rules (and breakpoints) from `src/index.css`. If they ever differ (e.g. inline 2.75rem but bundle 2.5rem), first paint will be overridden when the hashed CSS loads and you will see a shrink. When changing typography, update both places.

**DevHunt banner:** We use a static HTML banner in `index.html` (no third-party script). The official DevHunt script injects a Tailwind-style reset that overrode our heading styles and caused flicker; our banner shows the same message and links to https://devhunt.org/tool/anchr with no external JS. Heading rules use `#root h1`, `#root h2`, `#root h3` so any future third-party CSS cannot override them.

**If other flicker appears**, the cause is not the app typography system; it is one of: (1) stale HTML cached at CDN/browser, (2) another third-party script, (3) production serving an older deploy.

- **Three checks:** Incognito + DevTools "Disable cache" + hard refresh; remove DevHunt script, deploy, test; confirm production is latest deploy and HTML references hashed `assets/index-<hash>.css`.
- **The one test that isolates cause:** DevTools → Elements → select hero `<h1>` → watch **Computed** `font-size` and `line-height` → reload. If **font-size changes** after load → CSS override or stale CSS. If **font-size stays the same** but layout shifts → container width or injected DOM above hero (e.g. third-party).

## Build

```bash
npm run build
```

Output is in `dist/`. Serve the `dist/` folder as static files.

## Fly.io

The repo includes Fly config so you can run the site on the same org as your other apps.

Run each command separately (do not paste multiple lines at once; the shell may treat comments as arguments).

1. **First-time setup** (once per app). From repo root:
   ```bash
   cd website
   fly launch --no-deploy --copy-config -y
   ```
   Then add the custom domain:
   ```bash
   fly certs add anchr.sh
   ```
2. **Deploy:**
   ```bash
   cd website
   fly deploy
   ```
3. **DNS:** In GoDaddy (or your registrar), point `anchr.sh` at Fly:
   - **A record:** `anchr.sh` → value Fly shows for the app (e.g. IPv4 from `fly certs show anchr.sh`).
   - Or **CNAME:** `anchr.sh` → `anchr.fly.dev` (if your registrar allows CNAME on apex; otherwise use A).
4. **Headers:** Fly doesn’t read `_headers` / `vercel.json`. To add security headers, either use a custom nginx snippet in `nginx.conf` or configure them in `fly.toml` when available for your plan.

Machines are set to scale to zero when idle (`min_machines_running = 0`). To avoid cold starts after idle, set `min_machines_running = 1` in `fly.toml`.

If you see `Error spawning metrics process: fork/exec .../fly: no such file or directory` after `fly deploy`, the CLI is failing to run a local metrics subprocess; the app on Fly is fine and the deploy succeeded.

## Optional: 2-minute install test

Before launch, time a cold install: new repo → add workflow → open PR → see ANCHR verdict. Target: under 2 minutes. If it takes longer, simplify the workflow or docs. See `docs/DEVHUNT-LAUNCH-BLUEPRINT-V2-FINAL.md` (gate 8).
