// Daily resilience digest generator.
//
// Reads the retained alert window from alerts.json and asks Claude to produce an
// analyst-style briefing scoped to Rocket's THIRA risk profile. Writes:
//   digests/YYYY-MM-DD.md   — human-readable briefing
//   latest-digest.json      — structured form the dashboard can render
//
// Keyword scoring decides what to *collect*; this decides what actually *matters*:
// it collapses the same story repeated across 20 news feeds, discards noise that
// slipped past the tiers, and ties each item to a THIRA risk category.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const MODEL = 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

// From Rocket LP THIRA (assessed 02/26/2026, overall 9.4 Critical). The digest is
// asked to map findings onto these so output lines up with the risk register.
const THIRA_CRITICAL = [
  'Computer System Outage', 'Cyber Attack', 'Market/Interest Rate Change',
  'Vendor Outage', 'Telecom Failure - Data', 'Telecom Failure - Voice',
  'Embezzlement / Fraud', 'Mortgage Fraud', 'Sudden Loss of Key Staff',
  'Liquidity Shock', 'Flooding - Within Building', 'Borrowing Default',
  'Reputation Exposure', 'Misconfiguration/Team Member Mistake', 'Regulatory Change',
];
const THIRA_HIGH = [
  'Ice Storm', 'Bomb Threat / Warning', 'Burglary / Theft', 'Terrorism',
  'Freezing Weather', 'Snow Storm / Blizzard', 'Active Shooter', 'Pandemic',
];

const SYSTEM_PROMPT = `You are a business-resilience analyst supporting Rocket Companies' Resilience team (within Risk).

Your reader is a resilience manager doing a morning review. They need to know what changed, what to watch, and what needs action — nothing else.

Rocket context:
- HQ and primary data centers are in Detroit, MI. Detroit events carry outsized weight.
- Offices: Detroit (multiple), Phoenix AZ, Cleveland OH, Silver Spring MD, Charlotte NC, Dallas/Cypress Waters TX, Los Angeles CA, Windsor + Waterloo ON (Canada).
- Remote team members across ~45 US states and 4 Canadian provinces.
- Entities: Rocket Mortgage, Rocket Money, Rocket Homes, Rocket Loans, Rocket Close, Amrock, Redfin, Mr. Cooper, Bedrock, Rock Connections, Lendesk, Core Digital Media.
- Business is mortgage origination/servicing — highly regulated, interest-rate sensitive, dependent on third-party tech (title, credit, appraisal, e-sign, cloud).

THIRA Critical risks: ${THIRA_CRITICAL.join('; ')}.
THIRA High risks: ${THIRA_HIGH.join('; ')}.

Rules:
- Collapse duplicate coverage of one event into a single finding.
- Discard anything that is general news with no operational bearing on Rocket: elections, opinion, sports, celebrity, market commentary, routine regulatory filings, legislation in progress.
- Never invent detail. If the feed data is thin, say so rather than embellishing.
- Be blunt about uncertainty. "Unconfirmed" and "single source" are useful words.
- A quiet day is a valid finding. Do not manufacture urgency to fill space.`;

function buildUserPrompt(alerts, meta) {
  // Keep the payload tight — title/source/severity/date is enough to triage.
  const lines = alerts.map((a, i) =>
    `${i + 1}. [SEV${a.severity}] ${a.title}
   src=${a.sourceName || a.sourceId || '?'} | cat=${a.category || '?'} | region=${a.region || '?'} | ${(a.pubDate || '').slice(0, 16)}${a.active === false ? ' | NO LONGER ACTIVE' : ''}
   ${(a.description || '').slice(0, 320)}`
  ).join('\n');

  return `Alert window: ${meta.retentionDays || 7} days, ending ${meta.fetchedAt || 'now'}.
${alerts.length} retained alerts (${meta.activeItems ?? '?'} currently active).

Return ONLY valid JSON matching this shape, no prose outside it:

{
  "postureSummary": "2-3 sentence overall read for this morning",
  "postureLevel": "normal" | "elevated" | "high" | "crisis",
  "findings": [
    {
      "title": "short event title",
      "severity": 0,
      "thiraRisk": "closest THIRA risk name, or null",
      "whatHappened": "1-2 factual sentences",
      "rocketImpact": "concrete impact on Rocket people/facilities/operations, or 'No direct impact identified'",
      "action": "specific recommended action, or 'Monitor only'",
      "confidence": "high" | "medium" | "low",
      "sourceCount": 1,
      "locations": ["Detroit MI"]
    }
  ],
  "watchItems": ["things not yet actionable but trending"],
  "quietAreas": ["risk areas with nothing notable — useful negative signal"]
}

Order findings most-urgent first. Cap at 12 findings. severity: 0=catastrophic 1=crisis 2=major 3=significant.

ALERTS:
${lines}`;
}

async function callClaude(alerts, meta) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(alerts, meta) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  // Model may wrap JSON in a fence despite instructions — tolerate it.
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Could not parse model JSON: ${e.message}\nGot: ${cleaned.slice(0, 500)}`);
  }
}

const SEV_LABEL = ['SEV 0 — Catastrophic', 'SEV 1 — Crisis', 'SEV 2 — Major', 'SEV 3 — Significant', 'SEV 4 — Minor'];

function toMarkdown(digest, meta, date) {
  const out = [];
  out.push(`# Resilience Morning Digest — ${date}`);
  out.push('');
  out.push(`**Posture: ${String(digest.postureLevel || 'unknown').toUpperCase()}**`);
  out.push('');
  out.push(digest.postureSummary || '_No summary produced._');
  out.push('');
  out.push(`_Window: ${meta.retentionDays || 7} days · ${meta.totalItems || 0} retained alerts · ${meta.activeItems ?? '?'} active · generated ${new Date().toISOString()}_`);
  out.push('');

  const findings = digest.findings || [];
  if (!findings.length) {
    out.push('## Findings');
    out.push('');
    out.push('No findings warranting attention in this window.');
  } else {
    out.push(`## Findings (${findings.length})`);
    out.push('');
    findings.forEach((f, i) => {
      out.push(`### ${i + 1}. ${f.title}`);
      out.push('');
      out.push(`| | |`);
      out.push(`|---|---|`);
      out.push(`| **Severity** | ${SEV_LABEL[f.severity] || f.severity} |`);
      if (f.thiraRisk) out.push(`| **THIRA risk** | ${f.thiraRisk} |`);
      if (f.locations?.length) out.push(`| **Locations** | ${f.locations.join(', ')} |`);
      out.push(`| **Confidence** | ${f.confidence || 'unstated'}${f.sourceCount ? ` (${f.sourceCount} source${f.sourceCount === 1 ? '' : 's'})` : ''} |`);
      out.push('');
      out.push(`**What happened.** ${f.whatHappened || '—'}`);
      out.push('');
      out.push(`**Rocket impact.** ${f.rocketImpact || '—'}`);
      out.push('');
      out.push(`**Action.** ${f.action || 'Monitor only'}`);
      out.push('');
    });
  }

  if (digest.watchItems?.length) {
    out.push('## Watch list');
    out.push('');
    digest.watchItems.forEach(w => out.push(`- ${w}`));
    out.push('');
  }
  if (digest.quietAreas?.length) {
    out.push('## Quiet areas');
    out.push('');
    out.push('_Nothing notable — recorded as negative signal._');
    out.push('');
    digest.quietAreas.forEach(q => out.push(`- ${q}`));
    out.push('');
  }

  out.push('---');
  out.push(`Generated by Rocket Flow · Daily Resilience Digest · ${date}`);
  return out.join('\n');
}

async function main() {
  if (!existsSync('alerts.json')) {
    console.error('alerts.json not found — run the fetch workflow first.');
    process.exit(1);
  }
  const payload = JSON.parse(readFileSync('alerts.json', 'utf8'));
  const alerts = payload.alerts || [];
  if (!alerts.length) {
    console.error('No alerts to summarize.');
    process.exit(1);
  }

  // Only send what could plausibly matter — SEV 0-3. Caps token spend and noise.
  const candidates = alerts.filter(a => a.severity <= 3).slice(0, 220);
  console.log(`Summarizing ${candidates.length} of ${alerts.length} retained alerts…`);

  const digest = await callClaude(candidates, payload);
  const date = new Date().toISOString().slice(0, 10);

  mkdirSync('digests', { recursive: true });
  writeFileSync(`digests/${date}.md`, toMarkdown(digest, payload, date));
  writeFileSync('latest-digest.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    date,
    sourceWindow: { retentionDays: payload.retentionDays, totalItems: payload.totalItems, activeItems: payload.activeItems },
    ...digest,
  }, null, 2));

  console.log(`✓ digests/${date}.md — posture=${digest.postureLevel}, ${(digest.findings || []).length} findings`);
}

main().catch(e => { console.error('Digest failed:', e.message); process.exit(1); });
