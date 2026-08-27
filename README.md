# Rocket-Resilience-Team

Threat intelligence dashboard for the Rocket Companies Resilience team (under Risk).
Aggregates cyber, physical-threat, weather, infrastructure, and financial signals,
filters them to what actually bears on Rocket people, facilities, and operations,
and surfaces them on a single dashboard.

## How it works

```
.github/workflows/fetch-feeds.yml   every 15 min  ─┐
  └─ fetch-feeds.js                                │  collect + score + retain
       └─ alerts.json  (rolling 7-day window)  ────┘

ai-email-dashboard.html  ──reads──> alerts.json (via raw.githubusercontent.com)

.github/workflows/daily-digest.yml  once daily   ─┐
  └─ scripts/generate-digest.js (Claude)          │  analyst summary
       └─ digests/YYYY-MM-DD.md + latest-digest.json
```

Feeds are fetched **server-side** in GitHub Actions — no browser CORS proxy is
involved. The dashboard is a static HTML file that reads the committed
`alerts.json`.

## Filtering model

Severity runs 0 (worst) to 4 (minor); `minSeverity` per source drops anything less
urgent than the threshold.

| Tier | Meaning |
|---|---|
| SEV 0 | Catastrophic — mass casualty, infrastructure collapse |
| SEV 1 | Crisis — attack underway, confirmed breach, major disaster |
| SEV 2 | Major — credible threat, significant incident, Rocket entity named |
| SEV 3 | Significant — developing situation, watch-level weather, advisory |
| SEV 4 | Minor — background; filtered out of the dashboard |

Two scoring paths:

- **News/RSS sources** are keyword-scored against the SEV0–SEV3 tier lists in
  `fetch-feeds.js`. A mention of any Rocket entity escalates one tier.
- **Structured sources** (`structured: true` — NWS, USGS, FEMA, CISA KEV,
  Salesforce) derive severity from the data itself: NWS `severity`/`urgency`
  fields, earthquake magnitude, whether a KEV entry is ransomware-linked and hits
  a vendor in Rocket's stack, and whether a FEMA declaration is in a Rocket state.
  These are **not** keyword-scored — doing so silently discarded them entirely.

Keyword tiers are aligned to the **Rocket LP THIRA** (assessed 2026-02-26, overall
9.4 / Critical). Its Critical risks — vendor outage, telecom failure (data/voice),
computer system outage, cyber attack, mortgage/wire fraud, liquidity shock,
regulatory change — each have matching terms.

## Retention

`alerts.json` holds a **rolling 7 days**, not just the latest 15-minute snapshot.
Each run merges into the prior file:

- `firstSeen` / `lastSeen` — when an event appeared and was last confirmed
- `updateCount` — increments when severity changes
- `active` — `false` once an event stops appearing in the feeds

This is what makes the dashboard's alert search and location event history able to
look back over a week.

## Setup

### Feed fetching
Nothing required — `fetch-feeds.yml` runs on schedule with the default
`GITHUB_TOKEN`.

> GitHub disables scheduled workflows in repos with no commit activity for 60 days.
> A `keepalive` job guards against this; it is why the feed previously went stale
> for weeks with no visible failure.

### Daily digest (optional)
Add a repository secret:

- **Settings → Secrets and variables → Actions → New repository secret**
- Name: `ANTHROPIC_API_KEY`
- Value: an Anthropic API key from the Rocket console

Without the secret the digest workflow skips cleanly and never fails the repo.

## Feed health

Both workflows write a health summary to the run summary. Watch for two distinct
problems:

- **`failed`** — the URL 404s or won't parse. Fix the URL.
- **`returned 0 items`** — the fetch succeeded but everything was filtered out.
  A source in this state looks healthy while contributing nothing; this is how
  CISA KEV and FEMA went unnoticed. Check the source's `minSeverity` against the
  tier its items actually score.

## Local development

```bash
npm install
node fetch-feeds.js      # writes/merges alerts.json
```

Open `ai-email-dashboard.html` directly in a browser. It reads `alerts.json` from
the `main` branch on GitHub, so local feed runs won't change what it displays until
committed.

## Map

Leaflet with **OpenStreetMap standard tiles — no API key, no account, no
watermark.** The basemap is defined once in `addBasemap()`; both the threat map
and the mini-map use it.

Previously this used CARTO (`basemaps.cartocdn.com`), which now requires an
account and stamps unauthenticated tiles with an "API key required" overlay.

Notes:
- OSM tiles are more saturated than the old CARTO basemap, so the tile pane is
  desaturated in CSS (`.leaflet-tile-pane`) to keep alert pins readable. Markers
  and overlays are unaffected.
- OSM serves up to zoom 19; the map caps user zoom at 18 so Leaflet never
  requests a tile that doesn't exist.
- If tiles don't render, it's network/proxy access to `tile.openstreetmap.org` —
  never credentials. A warning is written to the dashboard log on tile errors.
