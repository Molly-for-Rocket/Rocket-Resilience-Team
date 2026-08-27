import fetch from 'node-fetch';
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RocketBCR/2.0)' } });
// ─── DATA SOURCES ─────────────────────────────────────────────────────────────
// minSeverity: items scoring above this number (less urgent) are dropped.
// 0=Catastrophic 1=Critical 2=High 3=Moderate 4=Minor (all kept)
// Resilience team needs: terrorist attacks, threat actor attacks on tech in North
// America, political unrest/mass demonstrations, direct Rocket entity impacts,
// government response updates, ongoing situation updates, data center risk.

const RSS_SOURCES = [
  // ── Cyber / Tech threat intel ──────────────────────────────────────────────
  { id: 'sans',          name: 'SANS Internet Storm Center',    category: 'cyber',       region: 'national',     minSeverity: 2, url: 'https://isc.sans.edu/rssfeed_full.xml' },
  { id: 'cisa-alerts',   name: 'CISA Advisories',               category: 'cyber',       region: 'national',     minSeverity: 2, url: 'https://www.cisa.gov/uscert/ncas/alerts.xml' },
  // ── Terror / Law Enforcement ───────────────────────────────────────────────
  { id: 'fbi',           name: 'FBI Press Releases',            category: 'terror',      region: 'national',     minSeverity: 2, url: 'https://www.fbi.gov/feeds/fbi-in-the-news/rss.xml' },
  // DHS: /dhs-news-updates/feed 404s. National Terrorism Advisory System is the
  // feed the Resilience team actually needs — it carries NTAS bulletins directly.
  { id: 'dhs',           name: 'DHS National Terrorism Advisory', category: 'terror',    region: 'national',     minSeverity: 3, url: 'https://www.dhs.gov/ntas/rss.xml' },
  // ── National News (strict filter — only genuine resilience events) ─────────
  { id: 'cbs',           name: 'CBS News National',             category: 'general',     region: 'national',     minSeverity: 2, url: 'https://www.cbsnews.com/latest/rss/main' },
  { id: 'nbc',           name: 'NBC News',                      category: 'general',     region: 'national',     minSeverity: 2, url: 'https://feeds.nbcnews.com/nbcnews/public/news' },
  { id: 'abc',           name: 'ABC News US',                   category: 'general',     region: 'national',     minSeverity: 2, url: 'https://feeds.abcnews.com/abcnews/usheadlines' },
  { id: 'npr',           name: 'NPR News',                      category: 'general',     region: 'national',     minSeverity: 2, url: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'cnn',           name: 'CNN Top Stories',               category: 'general',     region: 'national',     minSeverity: 2, url: 'http://rss.cnn.com/rss/cnn_topstories.rss' },
  // ── Detroit / HQ / Data Center region ─────────────────────────────────────
  { id: 'bridgemi',      name: 'Bridge Michigan',               category: 'general',     region: 'detroit',      minSeverity: 3, url: 'https://www.bridgemi.com/feed/' },
  { id: 'wdet',          name: 'WDET Detroit Public Radio',     category: 'general',     region: 'detroit',      minSeverity: 3, url: 'https://wdet.org/feed/' },
  // Detroit outlets migrated to Arc/Gannett feed platforms — old paths 404.
  { id: 'clickondet',    name: 'Click On Detroit (WDIV)',       category: 'general',     region: 'detroit',      minSeverity: 3, url: 'https://www.clickondetroit.com/arc/outboundfeeds/rss/category/news/?outputType=xml' },
  { id: 'wxyz',          name: 'WXYZ Detroit',                  category: 'general',     region: 'detroit',      minSeverity: 3, url: 'https://www.wxyz.com/news.rss' },
  { id: 'freep',         name: 'Detroit Free Press',            category: 'general',     region: 'detroit',      minSeverity: 3, url: 'https://www.freep.com/feeds/live/news/rss' },
  { id: 'detroitnews',   name: 'Detroit News',                  category: 'general',     region: 'detroit',      minSeverity: 3, url: 'https://www.detroitnews.com/feeds/live/news/rss' },
  // michigan.gov retired per-agency RSS. Google News queries are stable, CORS-free
  // server-side, and let us scope precisely to MSP / Michigan emergency management.
  { id: 'mspemergency',  name: 'Michigan State Police (news)',  category: 'datacenter',  region: 'detroit',      minSeverity: 3, url: 'https://news.google.com/rss/search?q=%22Michigan+State+Police%22+OR+%22Michigan+emergency%22&hl=en-US&gl=US&ceid=US:en' },
  { id: 'miready',       name: 'Michigan EMHSD / MI Ready',     category: 'datacenter',  region: 'detroit',      minSeverity: 3, url: 'https://news.google.com/rss/search?q=Michigan+%22state+of+emergency%22+OR+%22emergency+management%22&hl=en-US&gl=US&ceid=US:en' },
  // DTE / Consumers Energy outage coverage — THIRA flags Telecom/Power failure as
  // Critical for the Detroit data centers, but nothing was watching the utilities.
  { id: 'dteoutage',     name: 'DTE / Michigan Power Outages',  category: 'infrastructure', region: 'detroit',   minSeverity: 3, url: 'https://news.google.com/rss/search?q=%22DTE+Energy%22+outage+OR+%22Consumers+Energy%22+outage&hl=en-US&gl=US&ceid=US:en' },
  // ── Regional offices — strict filter ──────────────────────────────────────
  { id: 'latimes',       name: 'LA Times',                      category: 'general',     region: 'socal',        minSeverity: 2, url: 'https://www.latimes.com/local/rss2.0.xml' },
  { id: 'abc7la',        name: 'ABC7 LA',                       category: 'general',     region: 'socal',        minSeverity: 2, url: 'https://abc7.com/feed/' },
  { id: 'nbcdfw',        name: 'NBC5 DFW Local',                category: 'general',     region: 'dfw',          minSeverity: 2, url: 'https://www.nbcdfw.com/news/local/feed/' },
  { id: 'wfaa',          name: 'WFAA Dallas',                   category: 'general',     region: 'dfw',          minSeverity: 2, url: 'https://www.wfaa.com/feeds/syndication/rss/news' },
  { id: 'wtop',          name: 'WTOP News DC',                  category: 'general',     region: 'dc',           minSeverity: 2, url: 'https://wtop.com/feed/' },
  { id: 'wcnc',          name: 'WCNC Charlotte (NBC)',          category: 'general',     region: 'carolina',     minSeverity: 2, url: 'https://www.wcnc.com/feeds/syndication/rss/news' },
  // ── Financial regulators — only enforcement actions, not routine releases ──
  { id: 'cfpb',          name: 'CFPB Newsroom',                 category: 'financial',   region: 'national',     minSeverity: 2, url: 'https://www.consumerfinance.gov/about-us/newsroom/feed/' },
  { id: 'sec',           name: 'SEC Press Releases',            category: 'financial',   region: 'national',     minSeverity: 2, url: 'https://www.sec.gov/news/pressreleases.rss' },
];

// NOTE: `structured: true` marks sources whose severity is derived from the data
// itself (NWS urgency, quake magnitude, KEV exploitation status, FEMA declaration)
// rather than from news-style keyword matching. Keyword scoring silently zeroed out
// CISA KEV and FEMA entirely — a FEMA declaration matches no keyword and scored 4,
// and every KEV row matched "vulnerability" (tier 3) against a minSeverity of 2.
const JSON_SOURCES = [
  { id: 'nws',         name: 'NWS Active Alerts',           category: 'natural',        region: 'national',  minSeverity: 3, structured: true, url: 'https://api.weather.gov/alerts/active?area=MI,CA,TX,DC,VA,MD,PA,NC,OH,AZ,IN,IL,FL,GA,CO,NV,WA,MN,MO,TN,KY,SC,NJ,NY,OK,UT,OR,ID,NE,LA', headers: { 'Accept': 'application/geo+json', 'User-Agent': 'RocketBCR/2.0 (bcr@rocketcompanies.com)' } },
  { id: 'usgs',        name: 'USGS Earthquakes',            category: 'natural',        region: 'national',  minSeverity: 3, structured: true, url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson' },
  { id: 'fema',        name: 'FEMA Disaster Declarations',  category: 'natural',        region: 'national',  minSeverity: 3, structured: true, url: 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?%24orderby=declarationDate%20desc&%24top=50' },
  { id: 'cisa-kev',    name: 'CISA Known Exploited Vulns',  category: 'cyber',          region: 'national',  minSeverity: 3, structured: true, url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json' },
  { id: 'salesforce',  name: 'Salesforce Status',           category: 'infrastructure', region: 'national',  minSeverity: 3, structured: true, url: 'https://api.status.salesforce.com/v1/incidents' },
];

// ─── SEVERITY SCORING ─────────────────────────────────────────────────────────
// Philosophy: Only surface what the Resilience team actually needs to know.
// NOT news for general awareness — only operational threats to Rocket Companies,
// its people, its facilities, and its critical infrastructure.
//
// SEV 0 (score 0) = Catastrophic: mass-casualty, infrastructure collapse, EMP
// SEV 1 (score 1) = Crisis/Active: attack underway, confirmed breach, major disaster
// SEV 2 (score 2) = Major/Emerging: credible threat, significant incident, Rocket entity
// SEV 3 (score 3) = Significant: developing situation, weather warning, advisory
// SEV 4 (score 4) = Minor: background monitoring (usually filtered out by minSeverity)
//
// Key rule: debates, routine regulatory filings, opinion pieces, market commentary,
// legislation-in-progress, election news = SEV 4 — do not surface.

// ── Tier 0: Catastrophic — existential/mass-casualty events ─────────────────
const SEV0 = [
  'mass casualties','nuclear attack','emp attack','bioweapon attack','dirty bomb detonated',
  'radiological attack','nationwide grid failure','nationwide infrastructure collapse',
  'category 5 hurricane landfall','major earthquake magnitude 7','pandemic declared',
  'global pandemic','national emergency declared for attack','martial law declared',
  'chemical weapon attack','biological weapon release',
];

// ── Tier 1: Crisis/Active — confirmed active attacks, major confirmed incidents ─
// These are HAPPENING NOW or JUST CONFIRMED. Not threats or possibilities.
const SEV1 = [
  // Active physical violence / confirmed attacks
  'active shooter','mass shooting','terror attack','terrorist attack','bombing confirmed',
  'bomb exploded','explosion confirmed','hostage situation','hostage rescue underway',
  'vehicle ramming','suicide bomber','armed attack underway','assassination confirmed',
  'chemical attack confirmed','biological attack confirmed',
  // Active cyber attacks — confirmed destructive/critical
  'nation-state attack confirmed','destructive malware deployed','power grid attack',
  'critical infrastructure attack','ransomware attack confirmed','systems compromised',
  'widespread data breach confirmed','cisa emergency directive issued',
  'cyber attack confirmed','network taken down','major data breach at',
  // Active natural disaster
  'tornado on ground','dam failure','catastrophic flooding','major earthquake struck',
  'building collapse','bridge collapse',
  // Active operational emergencies
  'emergency evacuation ordered','shelter in place order','lockdown in effect',
  'active fire at','building evacuation underway',
  // DTE / utility — active outage affecting data centers
  'major power outage detroit','widespread outage michigan',
  'dte energy major outage','power grid failure michigan',
];

// ── Tier 2: Major/Emerging — credible threats, significant incidents ─────────
// Resilience team needs to know and may need to act or escalate monitoring.
// Includes: terrorist threats, political unrest/demonstrations, major weather,
// cyber advisories on in-use tech, Rocket entity mentions, infrastructure risks.
const SEV2 = [
  // Terrorism / physical security threats
  'bomb threat','credible threat','threat to','armed standoff','shots fired','shooting at',
  'active threat','terrorist threat','extremist threat','assassination attempt',
  'civil unrest','protest turns violent','riot','demonstration turns violent',
  'mass demonstration','mass protest','political violence','insurrection',
  // Cyber — significant but not confirmed destructive
  'cyberattack','cyber attack','ransomware','data breach','malware','threat actor',
  'zero-day exploited','network intrusion','unauthorized access confirmed',
  'ddos attack','security breach','critical vulnerability exploited',
  // Infrastructure / utility — significant risk to data centers
  'power outage','major outage','extended outage','grid failure','widespread outage',
  'service outage','internet outage','network outage','telecom outage',
  'dte outage','detroit power outage','data center outage',
  // Weather — warning level (imminent severe threat)
  'tornado warning','blizzard warning','ice storm warning','winter storm warning',
  'hurricane warning','tropical storm warning','flash flood warning','flood warning',
  'severe thunderstorm warning','extreme heat warning','freeze warning',
  'dangerous cold','wind chill warning',
  // Political unrest
  'mass demonstration','mass protest','march on washington','capitol breach',
  'political unrest','civil emergency','curfew issued','national guard deployed',
  'state of emergency declared','federal emergency declared',
  // Financial — enforcement actions against Rocket entities or major sector risk
  'enforcement action against','emergency order','cease and desist','license revoked',
  'criminal charges filed','federal indictment','bank failure','market halt',
  'trading suspended','emergency declaration',
  // Natural disasters
  'evacuation order','mandatory evacuation','hazmat incident','toxic spill',
  'chemical leak','structural fire','large fire',
  // Michigan State Police / City of Detroit emergency notices
  'michigan state police alert','michigan emergency','detroit emergency',
  'wayne county emergency',
  // ── THIRA-aligned Critical risks (Rocket LP THIRA, 02/26/2026, score 9.4) ──
  // The THIRA rates these Critical, but nothing in the tiers was matching them.
  // Vendor Outage (36.0) + Telecom Failure Data/Voice (24.0) + Computer System
  // Outage (36.0) are the top-scoring technology risks for the Detroit sites.
  'vendor outage','third-party outage','third party outage','supplier outage',
  'saas outage','cloud outage','aws outage','azure outage','google cloud outage',
  'cloudflare outage','okta outage','crowdstrike outage','fiserv outage',
  'ice mortgage technology','encompass outage','black knight outage',
  'telecom failure','fiber cut','fiber outage','voice outage','pbx outage',
  'carrier outage','att outage','verizon outage','comcast outage','level 3 outage',
  'core banking outage','payment system outage','wire transfer outage',
  'ach outage','fedwire','fednow outage','clearinghouse outage',
  // Embezzlement / Fraud + Mortgage Fraud (24.0 Critical)
  'mortgage fraud','wire fraud','embezzlement','title fraud','deed fraud',
  'appraisal fraud','loan fraud scheme','business email compromise',
  // Liquidity Shock / Borrowing Default (18.0 / 16.0 Critical)
  'liquidity crisis','warehouse line','margin call','credit downgrade',
  'covenant breach','ratings downgrade','bond downgrade',
  // DHS National Terrorism Advisory System bulletins
  'national terrorism advisory','ntas bulletin','elevated threat',
  'imminent threat alert','heightened threat environment',
];

// ── Tier 3: Significant — developing situations and advisories ───────────────
// Monitor and be aware. Not requiring immediate action. Includes watch-level
// weather, cyber patch advisories, developing investigations relevant to Rocket.
const SEV3 = [
  // Weather — watch/advisory level (potential future threat)
  'tornado watch','winter storm watch','ice storm watch','hurricane watch',
  'tropical storm watch','flood watch','heat advisory','wind advisory',
  'winter weather advisory','severe weather','weather warning','weather alert',
  // Cyber advisories — patch and vulnerability guidance
  'vulnerability','security advisory','security update','cve-','patch released',
  'cisa advisory','fbi advisory','zero-day','critical patch',
  // Developing situations
  'investigation underway','under investigation','breaking news','emergency response',
  'first responders on scene','police activity','major incident',
  // Power/utility advisories
  'power restored','outage resolved','service disruption','service degraded',
  'planned maintenance','michigan power','dte advisory',
  // Financial — regulatory actions affecting mortgage/lending industry
  'regulatory enforcement','mortgage enforcement','lending enforcement',
  'cfpb action','sec investigation','fraud charges',
  // Natural
  'earthquake','aftershock','wildfire','wildfire warning','flooding',
  'flash flood watch','high winds','winter storm',
];

// ── Rocket Companies and all affiliated entities ────────────────────────────
// Any alert mentioning these gets boosted one tier more urgent (floor: 0)
const ROCKET_NAMES = [
  // Core / holding
  'rocket companies','rocket limited partnership','rocket lp','rock central','rock holdings',
  // Mortgage / lending
  'rocket mortgage','quicken loans','amrock','rockloan','rocketloans','lmb mortgage',
  'lendesk','rocket close',
  // Fintech / consumer
  'rocket money',
  // Real estate
  'rocket homes','redfin','forsalebyowner','for sale by owner',
  // Automotive
  'rocket auto',
  // Title / insurance
  'rocket title',
  // Detroit real estate / development
  'bedrock','bedrock detroit','bedrock management',
  // Services / staffing
  'rock connections','rock foc','rock foc technologies',
  // International
  'rocket india','lendesk technologies',
  // Other
  'sift enterprises','rocket community fund','core digital media',
  'mr. cooper','mr cooper','cooper mortgage',
  // Critical buildings — boosts proximity alerts
  'first national building','one campus martius','chrysler house',
  '1001 woodward','cypress waters','9800 hillwood','17785 center court',
  'qube','611 woodward','800 tower drive','1401 rosa parks',
];

// ── States/provinces with Rocket offices or remote team members ──────────────
// Used to geo-filter FEMA declarations so we don't surface disasters in states
// where Rocket has no people or facilities.
const ROCKET_STATES = [
  'MI','CA','AZ','TX','OH','NC','PA','DC','VA','MD','NV','FL','WA','OR','NJ','NY',
  'OK','MN','WI','CO','TN','KY','GA','SC','IL','MO','UT','NE','LA','ID','AL','AK',
  'CT','DE','HI','KS','MA','ME','MS','NH','RI','SD',
];

// ── Enterprise tech in Rocket's stack (or ubiquitous enough to matter) ───────
// A CISA KEV entry against one of these is escalated — THIRA rates both Cyber
// Attack and Computer System Outage as Critical (36.0) for the Detroit sites.
const ENTERPRISE_TECH = [
  'microsoft','windows','exchange','office','sharepoint','active directory','azure',
  'outlook','teams','internet explorer','edge','sql server',
  'cisco','fortinet','fortios','palo alto','pan-os','citrix','netscaler','vmware',
  'esxi','vcenter','f5','big-ip','ivanti','pulse secure','sonicwall','juniper',
  'oracle','java','weblogic','apache','tomcat','log4j','struts','nginx',
  'linux','red hat','ubuntu','openssl','openssh',
  'google','chrome','android','adobe','acrobat','coldfusion',
  'atlassian','confluence','jira','bitbucket','jenkins','gitlab','github',
  'salesforce','servicenow','okta','sap','zoom','slack','crowdstrike',
  'progress','moveit','fortra','goanywhere','solarwinds','papercut','veeam',
  'zoho','manageengine','qnap','fortimanager','sharefile','netlogon',
];

// ── Terror/threat detection for map plotting ─────────────────────────────────
const PHYSICAL_TERROR = [
  'terror','terrorist','active shooter','mass shooting','suicide bomber',
  'ied','explosive device','hostage','domestic terror','vehicle attack',
  'extremist','gunman','bomb blast','armed attack','bombing','assassination',
  'chemical attack','biological attack','knife attack','vehicle ramming',
  'school shooting','church shooting','synagogue','mosque attack','nightclub shooting',
  'domestic extremism','mass casualty',
];
const CYBER_TERROR = [
  'nation-state','state-sponsored','power grid attack','critical infrastructure attack',
  'apt ','advanced persistent threat','sandworm','hafnium','volt typhoon','salt typhoon',
  'fancy bear','cozy bear','lazarus group','destructive malware','cyber emergency',
  'cisa emergency directive','ransomware attack on critical','cyber warfare',
  'cyber espionage','electric grid','water treatment attack','pipeline attack',
];

function scoreItem(title, desc) {
  const text = (title + ' ' + desc).toLowerCase();
  let score = 4;
  for (const w of SEV0) if (text.includes(w)) { score = 0; break; }
  if (score > 0) for (const w of SEV1) if (text.includes(w)) { score = 1; break; }
  if (score > 1) for (const w of SEV2) if (text.includes(w)) { score = 2; break; }
  if (score > 2) for (const w of SEV3) if (text.includes(w)) { score = 3; break; }
  // Boost for direct Rocket entity mention — moves one tier more critical, floor 0
  for (const r of ROCKET_NAMES) if (text.includes(r.toLowerCase())) { score = Math.max(0, score - 1); break; }
  return score;
}

// ── Structured-source severity ───────────────────────────────────────────────
// For feeds that publish their own urgency/severity, trust the source instead of
// keyword-matching prose. Still applies the Rocket-entity boost at the end.
function rocketBoost(text, score) {
  const t = text.toLowerCase();
  for (const r of ROCKET_NAMES) if (t.includes(r.toLowerCase())) return Math.max(0, score - 1);
  return score;
}

// NWS publishes severity (Extreme/Severe/Moderate) and urgency (Immediate/Expected).
function scoreNWS(p, text) {
  const sev = (p.severity || '').toLowerCase();
  const urg = (p.urgency || '').toLowerCase();
  const evt = (p.event || '').toLowerCase();
  let score = 3;
  if (sev === 'extreme') score = 1;
  else if (sev === 'severe') score = urg === 'immediate' ? 1 : 2;
  else if (sev === 'moderate') score = 3;
  else score = 4;
  // Tornado/blizzard/ice directly threaten Detroit HQ + DC access — never below 2.
  if (/tornado warning|blizzard warning|ice storm warning|hurricane warning/.test(evt)) score = Math.min(score, 1);
  return rocketBoost(text, score);
}

// USGS: magnitude is the severity signal.
function scoreQuake(mag, text) {
  let score = 4;
  if (mag >= 7.0) score = 0;
  else if (mag >= 6.0) score = 1;
  else if (mag >= 5.0) score = 2;
  else if (mag >= 4.0) score = 3;
  return rocketBoost(text, score);
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
      // Use full content for longer, richer descriptions
      const rawDesc = item.content || item.contentSnippet || item.summary || '';
      const desc = stripHtml(rawDesc).substring(0, 800);
      const severity = scoreItem(title, desc);
      const terror = detectTerror(title, desc);
      // Detect ongoing/current vs historical
      const isOngoing = /breaking|live|ongoing|now|developing|continues|update|alert|warning|watch|active|current/i.test(title + ' ' + desc.substring(0, 200));
      // Detect government response
      const hasGovResponse = /fema|white house|president|congress|senate|governor|mayor|national guard|federal|state emergency|dhs|fbi response|cisa|police response|deployed|emergency declared|responding/i.test(title + ' ' + desc);
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
        isOngoing,
        hasGovResponse,
      };
    }).filter(i => i.title.length > 5 && i.severity <= (source.minSeverity ?? 4));
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
    const rawItems = parseJSONSource(data, source);
    const items = rawItems.filter(i => i.severity <= (source.minSeverity ?? 4));
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
      const desc = ((p.description || '') + ' ' + (p.instruction || '')).substring(0, 800).trim();
      const isOngoing = /warning|watch|active|ongoing|currently/i.test(title);
      const hasGovResponse = /national weather service|emergency management|fema|governor/i.test(desc);
      items.push({ id: `nws-${p.id || Math.random()}`.substring(0,20), title, description: desc, link: p['@id'] || '', pubDate: p.sent || '', sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: scoreNWS(p, title + ' ' + desc), terror: detectTerror(title, desc), isOngoing, hasGovResponse, areaDesc: p.areaDesc || '', nwsEvent: p.event || '' });
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
      const desc = `Magnitude ${mag} earthquake near ${p.place}. Depth: ${coords[2]?.toFixed(1) || '?'} km. USGS status: ${p.status || 'reviewed'}. ${mag >= 5.0 ? 'SIGNIFICANT EARTHQUAKE — check for aftershocks and structural impact near Rocket offices.' : ''} ${p.tsunami === 1 ? 'TSUNAMI WARNING ISSUED.' : ''}`;
      items.push({ id: `usgs-${p.code || mag}`.substring(0,20), title, description: desc, link: p.url || '', pubDate: p.time ? new Date(p.time).toISOString() : '', sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, lat: eLat, lng: eLng, magnitude: mag, severity: scoreQuake(mag, title + ' ' + desc), terror: null, isOngoing: mag >= 4.5, hasGovResponse: mag >= 5.0 });
    }
  } else if (source.id === 'fema') {
    // Only surface declarations in states where Rocket has offices or remote TMs.
    // A federal declaration is inherently significant, so severity comes from the
    // declaration itself (was scoring 4 via keywords and being dropped entirely).
    const seen = new Set();
    for (const d of (data.DisasterDeclarationsSummaries || [])) {
      if (!ROCKET_STATES.includes(d.state)) continue;
      // API returns one row per designated county — collapse to one alert per disaster.
      if (seen.has(d.disasterNumber)) continue;
      seen.add(d.disasterNumber);
      // Skip stale declarations — resilience cares about the last 45 days.
      const declTime = new Date(d.declarationDate || 0).getTime();
      if (declTime && (Date.now() - declTime) > 45 * 24 * 3600 * 1000) continue;
      const title = `FEMA DR-${d.disasterNumber}: ${d.incidentType} — ${d.designatedArea}, ${d.state}`;
      const desc = `Federal disaster declaration active. Type: ${d.incidentType}. State: ${d.state}. Declared: ${(d.declarationDate || '').substring(0,10)}. Programs: ${[d.ihProgramDeclared && 'Individual Assistance', d.paProgramDeclared && 'Public Assistance', d.hmProgramDeclared && 'Hazard Mitigation'].filter(Boolean).join(', ') || 'See FEMA.gov'}. Government response is active — FEMA field teams mobilized.`;
      // Major declaration in a Rocket office state = SEV 2; MI (HQ + DC) = SEV 1.
      let sev = d.state === 'MI' ? 1 : 2;
      sev = rocketBoost(title + ' ' + desc, sev);
      items.push({ id: `fema-${d.disasterNumber}`, title, description: desc, link: `https://www.fema.gov/disaster/${d.disasterNumber}`, pubDate: d.declarationDate || '', sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: sev, terror: null, isOngoing: true, hasGovResponse: true });
      if (items.length >= 25) break;
    }
  } else if (source.id === 'cisa-kev') {
    // Every KEV entry is by definition actively exploited in the wild, so these are
    // never "minor". Vendors in ENTERPRISE_TECH are in Rocket's stack (or ubiquitous
    // enough to matter) and get escalated; the rest stay at SEV 3 for awareness.
    // Previously scoreItem() gave all of these a 3 against minSeverity 2, so the
    // entire KEV catalog was silently discarded.
    const recent = (data.vulnerabilities || []).slice(-60).reverse();
    for (const v of recent) {
      // Only surface KEV entries added in the last 30 days — older ones are backlog.
      const added = new Date(v.dateAdded || 0).getTime();
      if (added && (Date.now() - added) > 30 * 24 * 3600 * 1000) continue;
      const vendor = `${v.vendorProject || ''} ${v.product || ''}`.toLowerCase();
      const isEnterprise = ENTERPRISE_TECH.some(t => vendor.includes(t));
      const title = `CISA KEV: ${v.cveID} — ${v.vendorProject} ${v.product}`;
      const desc = `${v.vulnerabilityName}. This vulnerability is actively being exploited in the wild per CISA. Required action: ${v.requiredAction || 'See CISA guidance'}. Remediation due: ${v.dueDate || 'N/A'}. ${v.shortDescription || ''}. Government mandates federal agencies patch by due date; CISA strongly advises all organizations to follow.`;
      // Ransomware-linked + in-stack vendor = SEV 1; in-stack = SEV 2; else SEV 3.
      // CISA sets this field to exactly "Known" or "Unknown" — anchor the match so
      // "Unknown" does not satisfy a naive /known/i test.
      const ransomware = /^known$/i.test((v.knownRansomwareCampaignUse || '').trim());
      let sev = 3;
      if (isEnterprise) sev = ransomware ? 1 : 2;
      else if (ransomware) sev = 2;
      items.push({ id: v.cveID, title, description: desc, link: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', pubDate: v.dateAdded || '', sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: sev, terror: detectTerror(title, desc), isOngoing: true, hasGovResponse: true, vendor: v.vendorProject || '', ransomware });
      if (items.length >= 25) break;
    }
  } else if (source.id === 'salesforce') {
    const incidents = Array.isArray(data) ? data : (data.incidents || data.data || []);
    if (incidents.length === 0) {
      items.push({ id: 'sf-ok', title: 'Salesforce: No active incidents', description: 'All Salesforce services operating normally.', link: 'https://status.salesforce.com/', pubDate: new Date().toISOString(), sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: 4, terror: null, isOngoing: false, hasGovResponse: false });
    }
    for (const inc of incidents.slice(0, 15)) {
      const title = `Salesforce Incident: ${inc.message || inc.name || 'Active Incident'}`;
      const desc = `Status: ${inc.status || 'Unknown'}. Salesforce service disruption is ongoing. This may affect Rocket operations if Salesforce is in use. Monitor status.salesforce.com for real-time updates and estimated resolution time.`;
      items.push({ id: `sf-${inc.id || Math.random()}`.substring(0,20), title, description: desc, link: 'https://status.salesforce.com/', pubDate: inc.createdAt || new Date().toISOString(), sourceId: source.id, sourceName: source.name, category: source.category, region: source.region, severity: scoreItem(title, desc), terror: null, isOngoing: true, hasGovResponse: false });
    }
  }

  return items;
}

// ─── WRITE OUTPUT FILE ────────────────────────────────────────────────────────

import { writeFileSync, readFileSync, existsSync } from 'fs';

const RETENTION_DAYS = 7;

// Merge this run's alerts with the previous file so the dashboard has a rolling
// 7-day window to search instead of only the current 15-minute snapshot.
// `firstSeen` is preserved across runs so we can show when an event first appeared
// and how long it has been active.
function mergeHistory(freshItems) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
  const now = new Date().toISOString();
  const byKey = new Map();

  // Seed with previously retained alerts still inside the window.
  if (existsSync('alerts.json')) {
    try {
      const prev = JSON.parse(readFileSync('alerts.json', 'utf8'));
      for (const a of (prev.alerts || [])) {
        const seen = new Date(a.firstSeen || a.pubDate || 0).getTime();
        if (seen && seen < cutoff) continue;
        byKey.set(historyKey(a), a);
      }
    } catch (e) {
      console.log(`! Could not read previous alerts.json (${e.message}) — starting fresh history`);
    }
  }

  // Overlay this run. Existing entries keep firstSeen and gain lastSeen/updateCount.
  for (const item of freshItems) {
    const k = historyKey(item);
    const prior = byKey.get(k);
    if (prior) {
      byKey.set(k, {
        ...item,
        firstSeen: prior.firstSeen || prior.pubDate || now,
        lastSeen: now,
        updateCount: (prior.updateCount || 1) + (prior.severity !== item.severity ? 1 : 0),
        active: true,
      });
    } else {
      byKey.set(k, { ...item, firstSeen: now, lastSeen: now, updateCount: 1, active: true });
    }
  }

  // Anything retained but absent from this run is no longer active (resolved/aged out).
  const freshKeys = new Set(freshItems.map(historyKey));
  const merged = [];
  for (const [k, a] of byKey) {
    merged.push(freshKeys.has(k) ? a : { ...a, active: false });
  }

  merged.sort((a, b) =>
    a.severity - b.severity ||
    new Date(b.pubDate || b.firstSeen) - new Date(a.pubDate || a.firstSeen));
  return merged;
}

function historyKey(a) {
  return (a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
}

function writeOutput(freshItems, healthMap) {
  const alerts = mergeHistory(freshItems);
  const active = alerts.filter(a => a.active !== false);
  const payload = {
    fetchedAt: new Date().toISOString(),
    retentionDays: RETENTION_DAYS,
    totalItems: alerts.length,
    activeItems: active.length,
    health: healthMap,
    alerts,
  };
  writeFileSync('alerts.json', JSON.stringify(payload));
  console.log(`✓ Wrote alerts.json: ${active.length} active / ${alerts.length} retained over ${RETENTION_DAYS}d`);
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
  const empty = Object.entries(healthMap).filter(([, h]) => h.status === 'ok' && h.items === 0).map(([k]) => k);
  const failed = Object.entries(healthMap).filter(([, h]) => h.status === 'error').map(([k]) => k);
  console.log(`\n=== Results: ${deduped.length} alerts from ${healthy}/${RSS_SOURCES.length + JSON_SOURCES.length} sources ===`);
  if (failed.length) console.log(`  ✗ failed:   ${failed.join(', ')}`);
  // Surfacing these matters: a feed that returns 0 looks "healthy" but is silently
  // contributing nothing, which is how CISA KEV and FEMA went unnoticed for weeks.
  if (empty.length) console.log(`  ! returned 0 items: ${empty.join(', ')}`);
  console.log('');

  writeOutput(deduped, healthMap);
}

main().catch(console.error);
