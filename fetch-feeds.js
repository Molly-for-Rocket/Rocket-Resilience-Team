import fetch from 'node-fetch';
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RocketBCR/2.0)' } });
// ─── DATA SOURCES ─────────────────────────────────────────────────────────────

const RSS_SOURCES = [
  { id: 'sans',          name: 'SANS Internet Storm Center',  category: 'cyber',      region: 'national',      url: 'https://isc.sans.edu/rssfeed_full.xml' },
  { id: 'fbi',           name: 'FBI Press Releases',          category: 'terror',     region: 'national',      url: 'https://www.fbi.gov/feeds/fbi-in-the-news/rss.xml' },
  { id: 'cbs',           name: 'CBS News National',           category: 'general',    region: 'national',      url: 'https://www.cbsnews.com/latest/rss/main' },
  { id: 'thehill',       name: 'The Hill',                    category: 'general',    region: 'national',      url: 'https://thehill.com/feed/' },
  { id: 'nbc',           name: 'NBC News',                    category: 'general',    region: 'national',      url: 'https://feeds.nbcnews.com/nbcnews/public/news' },
  { id: 'abc',           name: 'ABC News US',                 category: 'general',    region: 'national',      url: 'https://feeds.abcnews.com/abcnews/usheadlines' },
  { id: 'npr',           name: 'NPR News',                    category: 'general',    region: 'national',      url: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'fox',           name: 'Fox News',                    category: 'general',    region: 'national',      url: 'https://moxie.foxnews.com/google-publisher/latest.xml' },
  { id: 'cnn',           name: 'CNN Top Stories',             category: 'general',    region: 'national',      url: 'http://rss.cnn.com/rss/cnn_topstories.rss' },
  { id: 'bridgemi',      name: 'Bridge Michigan',             category: 'general',    region: 'detroit',       url: 'https://www.bridgemi.com/feed/' },
  { id: 'wdet',          name: 'WDET Detroit Public Radio',   category: 'general',    region: 'detroit',       url: 'https://wdet.org/feed/' },
  { id: 'latimes',       name: 'LA Times',                    category: 'general',    region: 'socal',         url: 'https://www.latimes.com/local/rss2.0.xml' },
  { id: 'abc7la',        name: 'ABC7 LA',                     category: 'general',    region: 'socal',         url: 'https://abc7.com/feed/' },
  { id: 'nbcdfw',        name: 'NBC5 DFW Local',              category: 'general',    region: 'dfw',           url: 'https://www.nbcdfw.com/news/local/feed/' },
  { id: 'nbcdfw2',       name: 'NBC5 DFW Top Stories',        category: 'general',    region: 'dfw',           url: 'https://www.nbcdfw.com/feed/' },
  { id: 'wfaa',          name: 'WFAA Dallas',                 category: 'general',    region: 'dfw',           url: 'https://www.wfaa.com/feeds/syndication/rss/news' },
  { id: 'wtop',          name: 'WTOP News DC',                category: 'general',    region: 'dc',            url: 'https://wtop.com/feed/' },
  { id: 'wamu',          name: 'WAMU 88.5 DC',                category: 'general',    region: 'dc',            url: 'https://wamu.org/feed/' },
  { id: 'pgpostgazette', name: 'Pittsburgh Post-Gazette',     category: 'general',    region: 'pennsylvania',  url: 'https://www.post-gazette.com/rss/all' },
  { id: 'windsorstar',   name: 'Windsor Star',                category: 'general',    region: 'canada',        url: 'https://windsorstar.com/feed/' },
  { id: 'wcnc',          name: 'WCNC Charlotte (NBC)',        category: 'general',    region: 'carolina',      url: 'https://www.wcnc.com/feed/' },
  { id: 'fox8cleveland', name: 'Fox 8 Cleveland (WJW)',       category: 'general',    region: 'ohio',          url: 'https://fox8.com/feed/' },
  { id: 'ktar',          name: 'KTAR Phoenix News',           category: 'general',    region: 'arizona',       url: 'https://www.ktar.com/feed/' },
  { id: 'cfpb',          name: 'CFPB Newsroom',               category: 'financial',  region: 'national',      url: 'https://www.consumerfinance.gov/about-us/newsroom/feed/' },
  { id: 'sec',           name: 'SEC Press Releases',          category: 'financial',  region: 'national',      url: 'https://www.sec.gov/news/pressreleases.rss' },
];

const JSON_SOURCES = [
  { id: 'nws',        name: 'NWS Active Alerts',            category: 'natural',        region: 'national',  url: 'https://api.weather.gov/alerts/active?area=MI,CA,TX,DC,VA,MD,PA,NC,OH,AZ,IN,IL,FL,GA,CO,NV,WA,MN', headers: { 'Accept': 'application/geo+json', 'User-Agent': 'RocketBCR/2.0 (bcr@rocketcompanies.com)' } },
  { id: 'usgs',       name: 'USGS Earthquakes',             category: 'natural',        region: 'national',  url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson' },
  { id: 'fema',       name: 'FEMA Disaster Declarations',  category: 'natural',        region: 'national',  url: 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?%24orderby=declarationDate%20desc&%24top=50' },
  { id: 'cisa-kev',   name: 'CISA Known Exploited Vulns',  category: 'cyber',          region: 'national',  url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json' },
  { id: 'salesforce', name: 'Salesforce Status',           category: 'infrastructure', region: 'national',  url: 'https://api.status.salesforce.com/v1/incidents' },
];

// ─── SEVERITY SCORING ─────────────────────────────────────────────────────────

const SEV0 = ['mass casualties','nuclear','emp attack','bioweapon mass','nationwide infrastructure collapse','category 5'];
const SEV1 = ['active shooter','terror attack','bombing','hostage','nation-state attack','active attack','mass shooting','chemical attack','biological attack','attack underway','suicide bomber','vehicle ramming','killed in attack'];
const SEV2 = ['bomb threat','data breach','ransomware','federal disaster','evacuation','armed standoff','credible threat','major outage','cyberattack','malware','threat actor','critical infrastructure','emergency declaration','disaster declaration','active investigation'];
const SEV3 = ['weather warning','tornado watch','tornado warning','hurricane warning','winter storm warning','flood warning','watch','advisory','service disruption','power outage','developing','investigation','vulnerability','patch','earthquake','wildfire','shooting','explosion'];
const ROCKET_NAMES = ['rocket companies','quicken loans','amrock','rocket mortgage'];
const PHYSICAL_TERROR = ['terror','terrorist','active shooter','mass shooting','suicide bomber','ied','explosive device','hostage','domestic terror','vehicle attack','extremist attack','gunman','bomb blast','armed attack'];
const CYBER_TERROR = ['nation-state','state-sponsored','power grid attack','critical infrastructure attack','apt ','advanced persistent threat','sandworm','hafnium','destructive malware','cyber emergency','cisa emergency','ransomware attack on','cyber warfare'];

function scoreItem(title, desc) {
  const text = (title + ' ' + desc).toLowerCase();
  let score = 4;
  for (const w of SEV0) if (text.includes(w)) { score = 0; break; }
  if (score > 0) for (const w of SEV1) if (text.includes(w)) { score = 1; break; }
  if (score > 1) for (const w of SEV2) if (text.includes(w)) { score = 2; break; }
  if (score > 2) for (const w of SEV3) if (text.includes(w)) { score = 3; break; }
  for (const r of ROCKET_NAMES) if (text.includes(r)) { score = Math.max(0, score - 1); break; }
  return score;
}

function detectTerror(title, desc) {
  const text = (title + ' ' + desc).toLowerCase();
  for (const w of CYBER_TERROR) if (text.includes(w)) return 'cyber';
  for (const w of PHYSICAL_TERROR) if (text.includes(w)) return 'physical';
  return null;
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── FETCH RSS ─────────────────────────────────────────────────────────────────

async function fetchRSS(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = (feed.items || []).slice(0, 30).map(item => {
      const title = stripHtml(item.title || '').substring(0, 200);
      const desc = stripHtml(item.contentSnippet || item.content || item.summary || '').substring(0, 500);
      const severity = scoreItem(title, desc);
      const terror = detectTerror(title, desc);
      return {
        id: Buffer.from(title.substring(0, 40) + source.id).toString('base64').substring(0, 16),
        title,
        description: desc,
        link: item.link || item.guid || '',
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
        sourceId: source.id,
        sourceName: source.name,
        category: source.category,
        region: source.region,
        severity,
        terror,
      };
    }).filter(i => i.title.length > 5);
    console.log(`✓ ${source.name}: ${items.length} items`);
    return { sourceId: source.id, status: 'ok', items };
  } catch (e) {
    console.log(`✗ ${source.name}: ${e.message}`);
    return { sourceId: source.id, status: 'error', items: [] };
  }
}

// ─── FETCH JSON ───────────────────────────────────────────────────────────────

async function fetchJSON(source) {
  try {
    const res = await fetch(source.url, { headers: source.headers || { 'User-Agent': 'Mozilla/5.0 (compatible; RocketBCR/2.0)' }, timeout: 15000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = parseJSONSource(data, source);
    console.log(`✓ ${source.name}: ${items.length} items`);
    return { sourceId: source.id, status: 'ok', items };
  } catch (e) {
    console.log(`✗ ${source.name}: ${e.message}`);
    return { sourceId: source.id, status: 'error', items: [] };
  }
}

function parseJSONSource(data, source) {
  const items = [];
  const ROCKET_BBOX = { minLat: 24.5, maxLat: 49.5, minLng: -125, maxLng: -66 };

  if (source.id === 'nws') {
    for (const f of (data.features || []).slice(0, 50)) {
      const p = f.properties || {};
      const title = p.headline || p.event || 'NWS Alert';
      const desc = (p.description || p.instruction || '').substring(0, 500);
      items.push({ id: `nws-${p.id || Math.random()}`.substring(0,20), title, description: desc, link: p['@id'] || '', pubDate: p.sent || '', sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: scoreItem(title, desc), terror: detectTerror(title, desc) });
    }
  } else if (source.id === 'usgs') {
    for (const f of (data.features || []).slice(0, 100)) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates || [];
      const mag = p.mag || 0;
      if (mag < 2.5) continue;
      const eLat = coords[1], eLng = coords[0];
      if (eLat && eLng && (eLat < ROCKET_BBOX.minLat || eLat > ROCKET_BBOX.maxLat || eLng < ROCKET_BBOX.minLng || eLng > ROCKET_BBOX.maxLng)) continue;
      const title = `M${mag.toFixed(1)} Earthquake — ${p.place || 'Unknown'}`;
      const desc = `Magnitude ${mag} earthquake near ${p.place}. Depth: ${coords[2]?.toFixed(1) || '?'} km.`;
      items.push({ id: `usgs-${p.code || mag}`.substring(0,20), title, description: desc, link: p.url || '', pubDate: p.time ? new Date(p.time).toISOString() : '', sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, lat: eLat, lng: eLng, magnitude: mag, severity: scoreItem(title, desc), terror: null });
    }
  } else if (source.id === 'fema') {
    for (const d of (data.DisasterDeclarationsSummaries || []).slice(0, 30)) {
      const title = `FEMA DR-${d.disasterNumber}: ${d.incidentType} — ${d.designatedArea}, ${d.state}`;
      const desc = `Federal disaster declaration. Type: ${d.incidentType}. State: ${d.state}. Date: ${(d.declarationDate || '').substring(0,10)}`;
      items.push({ id: `fema-${d.disasterNumber}`, title, description: desc, link: `https://www.fema.gov/disaster/${d.disasterNumber}`, pubDate: d.declarationDate || '', sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: scoreItem(title, desc), terror: null });
    }
  } else if (source.id === 'cisa-kev') {
    for (const v of (data.vulnerabilities || []).slice(-20).reverse()) {
      const title = `CISA KEV: ${v.cveID} — ${v.vendorProject} ${v.product}`;
      const desc = `${v.vulnerabilityName}. Required action: ${v.requiredAction || 'See CISA guidance'}. Due: ${v.dueDate || 'N/A'}`;
      items.push({ id: v.cveID, title, description: desc, link: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', pubDate: v.dateAdded || '', sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: scoreItem(title, desc), terror: detectTerror(title, desc) });
    }
  } else if (source.id === 'salesforce') {
    const incidents = Array.isArray(data) ? data : (data.incidents || data.data || []);
    if (incidents.length === 0) {
      items.push({ id: 'sf-ok', title: 'Salesforce: No active incidents', description: 'All Salesforce services operating normally.', link: 'https://status.salesforce.com/', pubDate: new Date().toISOString(), sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: 4, terror: null });
    }
    for (const inc of incidents.slice(0, 15)) {
      const title = `Salesforce Incident: ${inc.message || inc.name || 'Active Incident'}`;
      const desc = `Status: ${inc.status || 'Unknown'}`;
      items.push({ id: `sf-${inc.id || Math.random()}`.substring(0,20), title, description: desc, link: 'https://status.salesforce.com/', pubDate: inc.createdAt || new Date().toISOString(), sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: scoreItem(title, desc), terror: null });
    }
  } else if (source.id === 'aws') {
    const allEvents = [];
    for (const [key, val] of Object.entries(data.current || {})) {
      if (Array.isArray(val)) for (const e of val) allEvents.push({ ...e, service: key });
    }
    if (allEvents.length === 0) {
      items.push({ id: 'aws-ok', title: 'AWS Services: All systems operational', description: 'No active AWS incidents.', link: 'https://status.aws.amazon.com/', pubDate: new Date().toISOString(), sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: 4, terror: null });
    }
    for (const e of allEvents.slice(0, 15)) {
      const title = `AWS: ${e.service_name || e.service} — ${e.summary || 'Event'}`;
      items.push({ id: `aws-${e.service}`.substring(0,20), title, description: e.message || e.summary || '', link: 'https://status.aws.amazon.com/', pubDate: e.date || new Date().toISOString(), sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: scoreItem(title, ''), terror: null });
    }
  } else if (source.id === 'azure') {
    const impacted = (data.services || []).filter(s => s.status && !['available','normal'].includes(s.status.toLowerCase()));
    if (impacted.length === 0) {
      items.push({ id: 'azure-ok', title: 'Azure Services: All systems normal', description: 'No active Azure incidents.', link: 'https://azure.status.microsoft/', pubDate: new Date().toISOString(), sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: 4, terror: null });
    }
    for (const s of impacted.slice(0, 15)) {
      const title = `Azure Disruption: ${s.displayName} — ${s.status}`;
      items.push({ id: `azure-${s.id || s.displayName}`.substring(0,20), title, description: `Azure service impacted: ${s.displayName}. Status: ${s.status}`, link: 'https://azure.status.microsoft/', pubDate: new Date().toISOString(), sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: scoreItem(title, ''), terror: null });
    }
  }

  return items;
}

// ─── WRITE OUTPUT FILE ────────────────────────────────────────────────────────
// spin.rp.foc.zone is an internal Rocket URL not reachable from GitHub Actions.
// Instead we write alerts.json to the repo; the workflow commits it back so the
// dashboard can fetch it from the GitHub raw content URL.

import { writeFileSync } from 'fs';

function writeOutput(allItems, healthMap) {
  const payload = {
    fetchedAt: new Date().toISOString(),
    totalItems: allItems.length,
    health: healthMap,
    alerts: allItems,
  };
  writeFileSync('alerts.json', JSON.stringify(payload));
  console.log(`✓ Wrote alerts.json: ${allItems.length} alerts`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== BCR Feed Fetch — ${new Date().toISOString()} ===\n`);

  const rssPromises = RSS_SOURCES.map(s => fetchRSS(s));
  const jsonPromises = JSON_SOURCES.map(s => fetchJSON(s));
  const results = await Promise.allSettled([...rssPromises, ...jsonPromises]);

  const allItems = [];
  const healthMap = {};

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { sourceId, status, items } = result.value;
      healthMap[sourceId] = { status, items: items.length, checkedAt: new Date().toISOString() };
      allItems.push(...items);
    }
  }

  // Deduplicate by title
  const seen = new Set();
  const deduped = allItems.filter(item => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => a.severity - b.severity || new Date(b.pubDate) - new Date(a.pubDate));

  const healthy = Object.values(healthMap).filter(h => h.status === 'ok').length;
  console.log(`\n=== Results: ${deduped.length} alerts from ${healthy}/${RSS_SOURCES.length + JSON_SOURCES.length} sources ===\n`);

  writeOutput(deduped, healthMap);
}

main().catch(console.error);
