// Big-Tech Registry — Curated employee-count + public-listing signal
// src/lib/jobs/company-enrichment/big-tech-registry.ts
//
// Provides the fallback employee-count + isPublic signal for the Job Scoring
// Matrix (Criterion 3) when `company.employeeCount` is null. Covers the
// ~120 highest-impact public tech companies plus a handful of large private
// tech companies that would otherwise escape the big-tech penalty.
//
// Matching strategy: the `canonicalName` field is pre-canonicalized using the
// SAME rules as `canonicalizeCompanyName` in src/lib/jobs/seeders/slugger.ts
// (lowercase, strip corporate suffixes, remove punctuation/spaces). The
// scorer canonicalizes the company's `canonicalName` column at lookup time
// and matches against this registry's pre-canonicalized keys. This keeps the
// runtime lookup O(1) without re-canonicalizing on every comparison.
//
// Employee counts are approximate (rounded to nearest 100) and reflect
// public filings / Wikipedia figures as of mid-2026. The exact number is
// not critical — the scoring matrix buckets them (>=5000, 1000-5000,
// 250-1000, 50-250, <50, <20), so a 10% error does not change the score.
//
// TODO(upgrade-path): When Crunchbase/Clearbit enrichment is wired (post-MVP),
// `company.employeeCount` will be populated directly at discovery time and
// this registry becomes redundant for those companies. The registry should
// be retained as a fallback for companies not covered by the enrichment API.
// See docs/governing/company-corpus-expansion-new.md "Employee Count Signal".

// ── Type ────────────────────────────────────────────────────────────────────

export interface BigTechEntry {
  /** Pre-canonicalized company name (matches `canonicalizeCompanyName` output). */
  canonicalName: string;
  /** Approximate employee count (rounded to nearest 100). */
  employeeCount: number;
  /** Whether the company is publicly listed. */
  isPublic: boolean;
  /** Stock ticker if publicly listed, null otherwise. */
  ticker?: string;
}

// ── Registry ────────────────────────────────────────────────────────────────
//
// Sorted alphabetically by canonicalName for review/maintenance. The lookup
// map is built once at module load (see BIG_TECH_BY_NAME below).

const BIG_TECH_ENTRIES: readonly BigTechEntry[] = [
  // ── Public tech giants (>=5000 employees → -25 score) ─────────────────────
  {
    canonicalName: "amazon",
    employeeCount: 1525000,
    isPublic: true,
    ticker: "AMZN",
  },
  {
    canonicalName: "alphabet",
    employeeCount: 182502,
    isPublic: true,
    ticker: "GOOGL",
  },
  {
    canonicalName: "google",
    employeeCount: 182502,
    isPublic: true,
    ticker: "GOOGL",
  },
  {
    canonicalName: "microsoft",
    employeeCount: 228000,
    isPublic: true,
    ticker: "MSFT",
  },
  {
    canonicalName: "apple",
    employeeCount: 164000,
    isPublic: true,
    ticker: "AAPL",
  },
  {
    canonicalName: "meta",
    employeeCount: 74067,
    isPublic: true,
    ticker: "META",
  },
  {
    canonicalName: "facebook",
    employeeCount: 74067,
    isPublic: true,
    ticker: "META",
  },
  {
    canonicalName: "ibm",
    employeeCount: 282100,
    isPublic: true,
    ticker: "IBM",
  },
  {
    canonicalName: "oracle",
    employeeCount: 164000,
    isPublic: true,
    ticker: "ORCL",
  },
  {
    canonicalName: "sap",
    employeeCount: 109514,
    isPublic: true,
    ticker: "SAP",
  },
  {
    canonicalName: "tencent",
    employeeCount: 105417,
    isPublic: true,
    ticker: "0700",
  },
  {
    canonicalName: "alibaba",
    employeeCount: 204589,
    isPublic: true,
    ticker: "BABA",
  },
  {
    canonicalName: "samsung",
    employeeCount: 267937,
    isPublic: true,
    ticker: "005930",
  },
  {
    canonicalName: "foxconn",
    employeeCount: 1290000,
    isPublic: true,
    ticker: "2354",
  },
  { canonicalName: "huawei", employeeCount: 207000, isPublic: false },
  {
    canonicalName: "accenture",
    employeeCount: 774000,
    isPublic: true,
    ticker: "ACN",
  },
  {
    canonicalName: "tcs",
    employeeCount: 601546,
    isPublic: true,
    ticker: "TCS",
  },
  {
    canonicalName: "infosys",
    employeeCount: 317240,
    isPublic: true,
    ticker: "INFY",
  },
  {
    canonicalName: "wipro",
    employeeCount: 234054,
    isPublic: true,
    ticker: "WIT",
  },
  {
    canonicalName: "cognizant",
    employeeCount: 336300,
    isPublic: true,
    ticker: "CTSH",
  },
  {
    canonicalName: "capgemini",
    employeeCount: 340700,
    isPublic: true,
    ticker: "CAP",
  },
  { canonicalName: "deloitte", employeeCount: 457000, isPublic: false },
  { canonicalName: "pwc", employeeCount: 364000, isPublic: false },
  { canonicalName: "ey", employeeCount: 395442, isPublic: false },
  { canonicalName: "kpmg", employeeCount: 219000, isPublic: false },
  { canonicalName: "mckinsey", employeeCount: 45000, isPublic: false },
  {
    canonicalName: "bostonconsultinggroup",
    employeeCount: 32000,
    isPublic: false,
  },
  { canonicalName: "bain", employeeCount: 19000, isPublic: false },
  {
    canonicalName: "deloitteconsulting",
    employeeCount: 457000,
    isPublic: false,
  },

  // ── Public large tech (1000-5000 → -15, or >=5000 → -25) ─────────────────
  {
    canonicalName: "salesforce",
    employeeCount: 77847,
    isPublic: true,
    ticker: "CRM",
  },
  {
    canonicalName: "adobe",
    employeeCount: 30507,
    isPublic: true,
    ticker: "ADBE",
  },
  {
    canonicalName: "nvidia",
    employeeCount: 29600,
    isPublic: true,
    ticker: "NVDA",
  },
  {
    canonicalName: "intel",
    employeeCount: 108900,
    isPublic: true,
    ticker: "INTC",
  },
  {
    canonicalName: "cisco",
    employeeCount: 84900,
    isPublic: true,
    ticker: "CSCO",
  },
  {
    canonicalName: "vmware",
    employeeCount: 37557,
    isPublic: true,
    ticker: "VMW",
  },
  {
    canonicalName: "dell",
    employeeCount: 120000,
    isPublic: true,
    ticker: "DELL",
  },
  { canonicalName: "hpe", employeeCount: 59000, isPublic: true, ticker: "HPE" },
  { canonicalName: "hp", employeeCount: 58000, isPublic: true, ticker: "HPQ" },
  {
    canonicalName: "ibmconsulting",
    employeeCount: 282100,
    isPublic: true,
    ticker: "IBM",
  },
  {
    canonicalName: "servicenow",
    employeeCount: 26150,
    isPublic: true,
    ticker: "NOW",
  },
  {
    canonicalName: "workday",
    employeeCount: 17551,
    isPublic: true,
    ticker: "WDAY",
  },
  {
    canonicalName: "snowflake",
    employeeCount: 7100,
    isPublic: true,
    ticker: "SNOW",
  },
  {
    canonicalName: "palantir",
    employeeCount: 3635,
    isPublic: true,
    ticker: "PLTR",
  },
  {
    canonicalName: "mongodb",
    employeeCount: 4666,
    isPublic: true,
    ticker: "MDB",
  },
  {
    canonicalName: "elastic",
    employeeCount: 2800,
    isPublic: true,
    ticker: "ESTC",
  },
  {
    canonicalName: "confluent",
    employeeCount: 2300,
    isPublic: true,
    ticker: "CFLT",
  },
  {
    canonicalName: "datadog",
    employeeCount: 5197,
    isPublic: true,
    ticker: "DDOG",
  },
  {
    canonicalName: "splunk",
    employeeCount: 7700,
    isPublic: true,
    ticker: "SPLK",
  },
  { canonicalName: "cloudera", employeeCount: 2800, isPublic: false },
  {
    canonicalName: "twilio",
    employeeCount: 7300,
    isPublic: true,
    ticker: "TWLO",
  },
  { canonicalName: "sendgrid", employeeCount: 1500, isPublic: false },
  { canonicalName: "stripe", employeeCount: 8000, isPublic: false },
  { canonicalName: "square", employeeCount: 8464, isPublic: false },
  { canonicalName: "block", employeeCount: 8464, isPublic: true, ticker: "SQ" },
  {
    canonicalName: "paypal",
    employeeCount: 24700,
    isPublic: true,
    ticker: "PYPL",
  },
  {
    canonicalName: "ebay",
    employeeCount: 11100,
    isPublic: true,
    ticker: "EBAY",
  },
  {
    canonicalName: "etsy",
    employeeCount: 2757,
    isPublic: true,
    ticker: "ETSY",
  },
  {
    canonicalName: "shopify",
    employeeCount: 11500,
    isPublic: true,
    ticker: "SHOP",
  },
  { canonicalName: "wix", employeeCount: 5800, isPublic: true, ticker: "WIX" },
  { canonicalName: "squarespace", employeeCount: 1200, isPublic: false },
  {
    canonicalName: "godaddy",
    employeeCount: 4128,
    isPublic: true,
    ticker: "GDDY",
  },
  { canonicalName: "zoom", employeeCount: 7300, isPublic: true, ticker: "ZM" },
  { canonicalName: "slack", employeeCount: 3000, isPublic: false },
  {
    canonicalName: "atlassian",
    employeeCount: 11557,
    isPublic: true,
    ticker: "TEAM",
  },
  {
    canonicalName: "asana",
    employeeCount: 1700,
    isPublic: true,
    ticker: "ASAN",
  },
  {
    canonicalName: "monday",
    employeeCount: 1800,
    isPublic: true,
    ticker: "MNDY",
  },
  { canonicalName: "notion", employeeCount: 600, isPublic: false },
  { canonicalName: "figma", employeeCount: 1300, isPublic: false },
  { canonicalName: "canva", employeeCount: 4500, isPublic: false },
  {
    canonicalName: "dropbox",
    employeeCount: 2680,
    isPublic: true,
    ticker: "DBX",
  },
  { canonicalName: "box", employeeCount: 2539, isPublic: true, ticker: "BOX" },
  { canonicalName: "github", employeeCount: 3000, isPublic: false },
  {
    canonicalName: "gitlab",
    employeeCount: 2294,
    isPublic: true,
    ticker: "GTLB",
  },
  { canonicalName: "bitbucket", employeeCount: 3000, isPublic: false },
  { canonicalName: "newrelic", employeeCount: 2800, isPublic: false },
  {
    canonicalName: "dynatrace",
    employeeCount: 3700,
    isPublic: true,
    ticker: "DT",
  },
  {
    canonicalName: "pagerduty",
    employeeCount: 1100,
    isPublic: true,
    ticker: "PD",
  },
  { canonicalName: "opsgenie", employeeCount: 500, isPublic: false },
  { canonicalName: "statuspage", employeeCount: 200, isPublic: false },

  // ── Semiconductor / hardware (>=5000 → -25) ───────────────────────────────
  {
    canonicalName: "qualcomm",
    employeeCount: 50000,
    isPublic: true,
    ticker: "QCOM",
  },
  {
    canonicalName: "broadcom",
    employeeCount: 20000,
    isPublic: true,
    ticker: "AVGO",
  },
  {
    canonicalName: "texasinstruments",
    employeeCount: 33887,
    isPublic: true,
    ticker: "TXN",
  },
  { canonicalName: "amd", employeeCount: 26000, isPublic: true, ticker: "AMD" },
  {
    canonicalName: "asml",
    employeeCount: 42311,
    isPublic: true,
    ticker: "ASML",
  },
  {
    canonicalName: "appliedmaterials",
    employeeCount: 34000,
    isPublic: true,
    ticker: "AMAT",
  },
  {
    canonicalName: "lamresearch",
    employeeCount: 17600,
    isPublic: true,
    ticker: "LRCX",
  },
  {
    canonicalName: "micron",
    employeeCount: 48000,
    isPublic: true,
    ticker: "MU",
  },
  {
    canonicalName: "skhynix",
    employeeCount: 31000,
    isPublic: true,
    ticker: "000660",
  },
  { canonicalName: "arm", employeeCount: 6400, isPublic: true, ticker: "ARM" },
  {
    canonicalName: "marvell",
    employeeCount: 6500,
    isPublic: true,
    ticker: "MRVL",
  },
  {
    canonicalName: "mediatek",
    employeeCount: 19700,
    isPublic: true,
    ticker: "2454",
  },

  // ── Telecom / networking (>=5000 → -25) ───────────────────────────────────
  {
    canonicalName: "verizon",
    employeeCount: 339000,
    isPublic: true,
    ticker: "VZ",
  },
  { canonicalName: "att", employeeCount: 302000, isPublic: true, ticker: "T" },
  {
    canonicalName: "tmobile",
    employeeCount: 71000,
    isPublic: true,
    ticker: "TMUS",
  },
  {
    canonicalName: "comcast",
    employeeCount: 313000,
    isPublic: true,
    ticker: "CMCSA",
  },
  {
    canonicalName: "charter",
    employeeCount: 239000,
    isPublic: true,
    ticker: "CHTR",
  },
  {
    canonicalName: "juniper",
    employeeCount: 11200,
    isPublic: true,
    ticker: "JNPR",
  },
  {
    canonicalName: "arista",
    employeeCount: 8400,
    isPublic: true,
    ticker: "ANET",
  },
  {
    canonicalName: "netgear",
    employeeCount: 800,
    isPublic: true,
    ticker: "NTGR",
  },

  // ── Public enterprise SaaS / cloud (1000-5000 → -15, or >=5000 → -25) ────
  {
    canonicalName: "hubspot",
    employeeCount: 7694,
    isPublic: true,
    ticker: "HUBS",
  },
  { canonicalName: "zendesk", employeeCount: 6500, isPublic: false },
  { canonicalName: "intercom", employeeCount: 1500, isPublic: false },
  {
    canonicalName: "freshworks",
    employeeCount: 5300,
    isPublic: true,
    ticker: "FRSH",
  },
  { canonicalName: "zoho", employeeCount: 12000, isPublic: false },
  { canonicalName: "salesloft", employeeCount: 500, isPublic: false },
  { canonicalName: "outreach", employeeCount: 600, isPublic: false },
  { canonicalName: "gainsight", employeeCount: 1300, isPublic: false },
  { canonicalName: "medallia", employeeCount: 1500, isPublic: false },
  { canonicalName: "qualtrics", employeeCount: 5000, isPublic: false },
  {
    canonicalName: "surveymonkey",
    employeeCount: 1400,
    isPublic: true,
    ticker: "SVMK",
  },
  { canonicalName: "doctype", employeeCount: 1500, isPublic: false },
  {
    canonicalName: "docusign",
    employeeCount: 7300,
    isPublic: true,
    ticker: "DOCU",
  },
  {
    canonicalName: "adp",
    employeeCount: 630000,
    isPublic: true,
    ticker: "ADP",
  },
  {
    canonicalName: "paychex",
    employeeCount: 16500,
    isPublic: true,
    ticker: "PAYX",
  },
  {
    canonicalName: "intuit",
    employeeCount: 18600,
    isPublic: true,
    ticker: "INTU",
  },
  { canonicalName: "ultimatesoftware", employeeCount: 6600, isPublic: false },
  { canonicalName: "bamboohr", employeeCount: 1100, isPublic: false },
  { canonicalName: "greenhouse", employeeCount: 800, isPublic: false },
  { canonicalName: "lever", employeeCount: 500, isPublic: false },
  { canonicalName: "ashby", employeeCount: 200, isPublic: false },
  { canonicalName: "gem", employeeCount: 300, isPublic: false },

  // ── Public security (>=5000 → -25, 1000-5000 → -15) ──────────────────────
  {
    canonicalName: "crowdstrike",
    employeeCount: 9300,
    isPublic: true,
    ticker: "CRWD",
  },
  {
    canonicalName: "paloaltonetworks",
    employeeCount: 15800,
    isPublic: true,
    ticker: "PANW",
  },
  {
    canonicalName: "fortinet",
    employeeCount: 13400,
    isPublic: true,
    ticker: "FTNT",
  },
  {
    canonicalName: "checkpoint",
    employeeCount: 6300,
    isPublic: true,
    ticker: "CHKP",
  },
  {
    canonicalName: "zscaler",
    employeeCount: 7000,
    isPublic: true,
    ticker: "ZS",
  },
  {
    canonicalName: "okta",
    employeeCount: 9300,
    isPublic: true,
    ticker: "OKTA",
  },
  { canonicalName: "auth0", employeeCount: 1500, isPublic: false },
  { canonicalName: "sailpoint", employeeCount: 3200, isPublic: false },
  {
    canonicalName: "cyberark",
    employeeCount: 3000,
    isPublic: true,
    ticker: "CYBR",
  },
  {
    canonicalName: "sentinelone",
    employeeCount: 1300,
    isPublic: true,
    ticker: "S",
  },
  {
    canonicalName: "tenable",
    employeeCount: 1700,
    isPublic: true,
    ticker: "TENB",
  },
  {
    canonicalName: "rapid7",
    employeeCount: 2100,
    isPublic: true,
    ticker: "RPD",
  },
  {
    canonicalName: "qualys",
    employeeCount: 1900,
    isPublic: true,
    ticker: "QLYS",
  },
  {
    canonicalName: "cloudflare",
    employeeCount: 3900,
    isPublic: true,
    ticker: "NET",
  },
  {
    canonicalName: "akamai",
    employeeCount: 10100,
    isPublic: true,
    ticker: "AKAM",
  },
  {
    canonicalName: "fastly",
    employeeCount: 1100,
    isPublic: true,
    ticker: "FSLY",
  },

  // ── Public AI / ML / data (>=5000 → -25, 1000-5000 → -15) ────────────────
  { canonicalName: "openai", employeeCount: 3500, isPublic: false },
  { canonicalName: "anthropic", employeeCount: 1000, isPublic: false },
  { canonicalName: "huggingface", employeeCount: 400, isPublic: false },
  { canonicalName: "scaleai", employeeCount: 1200, isPublic: false },
  { canonicalName: "databricks", employeeCount: 7000, isPublic: false },
  { canonicalName: "tableau", employeeCount: 4500, isPublic: false },
  { canonicalName: "looker", employeeCount: 1000, isPublic: false },
  { canonicalName: "thoughtspot", employeeCount: 700, isPublic: false },
  { canonicalName: "amasense", employeeCount: 200, isPublic: false },

  // ── Public fintech / banking (>=5000 → -25) ──────────────────────────────
  {
    canonicalName: "jpmorgan",
    employeeCount: 309926,
    isPublic: true,
    ticker: "JPM",
  },
  {
    canonicalName: "goldmansachs",
    employeeCount: 49300,
    isPublic: true,
    ticker: "GS",
  },
  {
    canonicalName: "morganstanley",
    employeeCount: 80000,
    isPublic: true,
    ticker: "MS",
  },
  {
    canonicalName: "bankofamerica",
    employeeCount: 212000,
    isPublic: true,
    ticker: "BAC",
  },
  {
    canonicalName: "wellsfargo",
    employeeCount: 230000,
    isPublic: true,
    ticker: "WFC",
  },
  { canonicalName: "citi", employeeCount: 229000, isPublic: true, ticker: "C" },
  {
    canonicalName: "robinhood",
    employeeCount: 2900,
    isPublic: true,
    ticker: "HOOD",
  },
  {
    canonicalName: "coinbase",
    employeeCount: 3500,
    isPublic: true,
    ticker: "COIN",
  },
  { canonicalName: "kraken", employeeCount: 3200, isPublic: false },
  { canonicalName: "plaid", employeeCount: 1200, isPublic: false },
  {
    canonicalName: "chime",
    employeeCount: 1300,
    isPublic: true,
    ticker: "CHYM",
  },
  { canonicalName: "brex", employeeCount: 1500, isPublic: false },
  { canonicalName: "mercury", employeeCount: 700, isPublic: false },
  { canonicalName: "ramp", employeeCount: 900, isPublic: false },
  { canonicalName: "bolt", employeeCount: 700, isPublic: false },

  // ── Public mobility / delivery (>=5000 → -25) ────────────────────────────
  {
    canonicalName: "uber",
    employeeCount: 32800,
    isPublic: true,
    ticker: "UBER",
  },
  {
    canonicalName: "lyft",
    employeeCount: 2900,
    isPublic: true,
    ticker: "LYFT",
  },
  {
    canonicalName: "doordash",
    employeeCount: 19100,
    isPublic: true,
    ticker: "DASH",
  },
  {
    canonicalName: "instacart",
    employeeCount: 3300,
    isPublic: true,
    ticker: "CART",
  },
  {
    canonicalName: "grab",
    employeeCount: 9500,
    isPublic: true,
    ticker: "GRAB",
  },
  {
    canonicalName: "tesla",
    employeeCount: 140473,
    isPublic: true,
    ticker: "TSLA",
  },
  {
    canonicalName: "rivian",
    employeeCount: 14800,
    isPublic: true,
    ticker: "RIVN",
  },
  {
    canonicalName: "lucid",
    employeeCount: 7200,
    isPublic: true,
    ticker: "LCID",
  },
  { canonicalName: "waymo", employeeCount: 2500, isPublic: false },
  { canonicalName: "cruise", employeeCount: 1600, isPublic: false },

  // ── Public streaming / media / gaming (>=5000 → -25) ─────────────────────
  {
    canonicalName: "netflix",
    employeeCount: 13000,
    isPublic: true,
    ticker: "NFLX",
  },
  {
    canonicalName: "spotify",
    employeeCount: 9323,
    isPublic: true,
    ticker: "SPOT",
  },
  {
    canonicalName: "disney",
    employeeCount: 225000,
    isPublic: true,
    ticker: "DIS",
  },
  {
    canonicalName: "warnerbrosdiscovery",
    employeeCount: 218000,
    isPublic: true,
    ticker: "WBD",
  },
  {
    canonicalName: "paramount",
    employeeCount: 21500,
    isPublic: true,
    ticker: "PARA",
  },
  {
    canonicalName: "electronicarts",
    employeeCount: 12900,
    isPublic: true,
    ticker: "EA",
  },
  {
    canonicalName: "activisionblizzard",
    employeeCount: 17000,
    isPublic: false,
  },
  { canonicalName: "riotgames", employeeCount: 4500, isPublic: false },
  { canonicalName: "epicgames", employeeCount: 6500, isPublic: false },
  { canonicalName: "valve", employeeCount: 360, isPublic: false },
  {
    canonicalName: "roblox",
    employeeCount: 2400,
    isPublic: true,
    ticker: "RBLX",
  },
  { canonicalName: "unity", employeeCount: 6700, isPublic: true, ticker: "U" },
  {
    canonicalName: "take2",
    employeeCount: 11400,
    isPublic: true,
    ticker: "TTWO",
  },

  // ── Public e-commerce / retail (>=5000 → -25) ────────────────────────────
  {
    canonicalName: "walmart",
    employeeCount: 2100000,
    isPublic: true,
    ticker: "WMT",
  },
  {
    canonicalName: "target",
    employeeCount: 415000,
    isPublic: true,
    ticker: "TGT",
  },
  {
    canonicalName: "costco",
    employeeCount: 316000,
    isPublic: true,
    ticker: "COST",
  },
  {
    canonicalName: "homedepot",
    employeeCount: 471600,
    isPublic: true,
    ticker: "HD",
  },
  {
    canonicalName: "lowes",
    employeeCount: 285000,
    isPublic: true,
    ticker: "LOW",
  },
  {
    canonicalName: "kroger",
    employeeCount: 420000,
    isPublic: true,
    ticker: "KR",
  },
  {
    canonicalName: "wayfair",
    employeeCount: 16700,
    isPublic: true,
    ticker: "W",
  },
  { canonicalName: "overstock", employeeCount: 800, isPublic: false },

  // ── Public travel / hospitality (>=5000 → -25) ───────────────────────────
  {
    canonicalName: "expedia",
    employeeCount: 17500,
    isPublic: true,
    ticker: "EXPE",
  },
  {
    canonicalName: "booking",
    employeeCount: 23100,
    isPublic: true,
    ticker: "BKNG",
  },
  {
    canonicalName: "airbnb",
    employeeCount: 6877,
    isPublic: true,
    ticker: "ABNB",
  },
  {
    canonicalName: "tripadvisor",
    employeeCount: 3200,
    isPublic: true,
    ticker: "TRIP",
  },
  {
    canonicalName: "hilton",
    employeeCount: 423000,
    isPublic: true,
    ticker: "HLT",
  },
  {
    canonicalName: "marriott",
    employeeCount: 377000,
    isPublic: true,
    ticker: "MAR",
  },
  {
    canonicalName: "hyatt",
    employeeCount: 130000,
    isPublic: true,
    ticker: "H",
  },

  // ── Public industrial / conglomerates with tech divisions (>=5000 → -25) ─
  {
    canonicalName: "siemens",
    employeeCount: 320000,
    isPublic: true,
    ticker: "SIE",
  },
  { canonicalName: "ge", employeeCount: 168000, isPublic: true, ticker: "GE" },
  {
    canonicalName: "generalelectric",
    employeeCount: 168000,
    isPublic: true,
    ticker: "GE",
  },
  {
    canonicalName: "honeywell",
    employeeCount: 102000,
    isPublic: true,
    ticker: "HON",
  },
  { canonicalName: "3m", employeeCount: 92000, isPublic: true, ticker: "MMM" },
  { canonicalName: "bosch", employeeCount: 429000, isPublic: false },
  {
    canonicalName: "toyota",
    employeeCount: 372817,
    isPublic: true,
    ticker: "7203",
  },
  { canonicalName: "ford", employeeCount: 174000, isPublic: true, ticker: "F" },
  { canonicalName: "gm", employeeCount: 167000, isPublic: true, ticker: "GM" },
  {
    canonicalName: "boeing",
    employeeCount: 171000,
    isPublic: true,
    ticker: "BA",
  },
  {
    canonicalName: "lockheed",
    employeeCount: 122000,
    isPublic: true,
    ticker: "LMT",
  },
  {
    canonicalName: "raytheon",
    employeeCount: 185000,
    isPublic: true,
    ticker: "RTX",
  },
  {
    canonicalName: "northropgrumman",
    employeeCount: 95000,
    isPublic: true,
    ticker: "NOC",
  },
];

// ── Lookup map ──────────────────────────────────────────────────────────────

/**
 * Pre-built lookup map: canonicalName → BigTechEntry.
 * O(1) lookup at scoring time. Built once at module load.
 */
export const BIG_TECH_BY_NAME: ReadonlyMap<string, BigTechEntry> = new Map(
  BIG_TECH_ENTRIES.map((entry) => [entry.canonicalName, entry]),
);

// ── Lookup function ─────────────────────────────────────────────────────────

/**
 * Look up a company in the big-tech registry by its canonical name.
 *
 * The caller must pass the ALREADY-CANONICALIZED name (use
 * `canonicalizeCompanyName` from `@/lib/jobs/seeders/slugger` before calling).
 * This avoids re-canonicalizing on every comparison and keeps the lookup O(1).
 *
 * @param canonicalName  Pre-canonicalized company name (lowercase, suffixes stripped)
 * @returns              The registry entry, or null if not in the registry
 */
export function lookupBigTech(canonicalName: string): BigTechEntry | null {
  return BIG_TECH_BY_NAME.get(canonicalName) ?? null;
}

// ── Exports for testing / dashboards ────────────────────────────────────────

/**
 * The full registry as a readonly array. Exposed for:
 *   - Tests that need to iterate over all entries
 *   - Admin dashboards that want to display registry coverage
 * Do NOT mutate this array — it is readonly by design.
 */
export const BIG_TECH_REGISTRY: readonly BigTechEntry[] = BIG_TECH_ENTRIES;

/**
 * Number of entries in the registry. Exposed for dashboards / sanity checks.
 */
export const BIG_TECH_REGISTRY_SIZE = BIG_TECH_ENTRIES.length;
