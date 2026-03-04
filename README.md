# Business Register Scraper — API Server

A Node.js REST API that scrapes national business registries and exposes the data over HTTP. Each supported country has its own **jurisdiction adapter** that encapsulates all registry-specific HTML parsing logic. Designed to run behind a **Caddy** reverse proxy or as a **Docker** container.

---

## Stack

| Layer              | Technology              |
| ------------------ | ----------------------- |
| Runtime            | Node.js 22              |
| Language           | JavaScript (ES modules) |
| HTTP server        | Express                 |
| Browser automation | Playwright (Chromium)   |
| HTML parsing       | Cheerio                 |
| Bundler            | esbuild                 |
| Container          | Docker (multi-stage)    |
| Reverse proxy      | Caddy                   |

---

## Project Structure

```
register-scraper/
├── src/
│   ├── index.js                  # Express app entry point
│   ├── scraper.js                # Playwright orchestration (browser, search, save)
│   ├── controllers/
│   │   └── companyController.js  # Request validation + response shaping
│   ├── routes/
│   │   └── company.js            # Route wiring
│   └── jurisdictions/            # One adapter file per country
│       ├── base.js               # Abstract base class (interface contract)
│       ├── ee.js                 # Estonia — fully implemented
│       ├── lv.js                 # Latvia — stub
│       ├── lt.js                 # Lithuania — stub
│       ├── fi.js                 # Finland — stub
│       ├── se.js                 # Sweden — stub
│       ├── dk.js                 # Denmark — stub
│       ├── no.js                 # Norway — stub
│       ├── de.js                 # Germany — stub
│       └── pl.js                 # Poland — stub
├── config/
│   └── jurisdictions.js          # Registry of adapter instances (keyed by ISO code)
├── scripts/
│   ├── build.js                  # esbuild bundle script → dist/server.js
│   └── preflight.js              # Pre-deploy validation (adapters, env, disk)
├── dist/                         # Bundle output (git-ignored)
│   └── server.js
├── Dockerfile                    # Two-stage build (builder + slim runtime)
├── Caddyfile
├── package.json
└── .env.example

# Output is written to the data folder:
data/
└── YYYY-MM-DD/
    └── <jurisdiction>/
        ├── search-<query>.jpg          ← search results screenshot
        ├── search-<query>.json         ← search results list
        ├── autocomplete-<query>.jpg    ← autocomplete dropdown screenshot
        ├── autocomplete-<query>.json   ← autocomplete suggestions list
        ├── CompanyName.jpg             ← full-page company screenshot
        └── CompanyName.json            ← structured company JSON
```

---

## Architecture

### Jurisdiction adapters

All registry-specific logic lives in `src/jurisdictions/<code>.js`. The scraper (`scraper.js`) contains only generic Playwright orchestration — it never references a registry's HTML directly. Instead, it resolves the right adapter at runtime and delegates:

```
Request
  └─► companyController.js   validates input, calls scraper functions
        └─► scraper.js        launches browser, navigates, waits for page
              └─► adapter     extractSearchResults(html)
                              extractCompanyDetail(html)
                              extractCompanyResult(page, html, companyName)
                              extractAutocompleteSuggestions(page)
```

Each adapter extends `BaseJurisdictionAdapter` and must provide:

| Member | Type | Description |
| --- | --- | --- |
| `baseUrl` | getter | Registry root URL |
| `searchUrl` | getter | Search page URL |
| `selectors` | getter | `{ searchInput, searchButton, autocompleteDropdown, autocompleteItem }` |
| `detailReadySelector` | getter | CSS selector to wait for before extracting detail HTML |
| `extractSearchResults(html)` | method | Parse search results page → `[{ name, registryCode, status, address, url }]` |
| `extractCompanyDetail(html)` | method | Parse detail page into raw sections (used internally by `extractCompanyResult`) |
| `extractCompanyResult(page, html, companyName)` | async method | Assemble final structured company object (may use live `page` for JS-rendered tables) |
| `extractAutocompleteSuggestions(page)` | async method | Return autocomplete suggestions; base returns `[]` |

### Adding a new jurisdiction

1. Create `src/jurisdictions/<code>.js` extending `BaseJurisdictionAdapter`
2. Register it in `config/jurisdictions.js`
3. Add it to `FULLY_IMPLEMENTED` in `scripts/preflight.js` once complete
4. Run `npm run build` — preflight will fail if any required method is missing

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Install Playwright browser

```bash
npx playwright install chromium
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` as needed — defaults work out of the box for Estonia.

---

## Running

### Development (auto-restart on file change)

```bash
npm run dev
```

### Production (source)

```bash
npm start
```

### Production (bundled)

```bash
npm run build        # runs preflight + esbuild → dist/server.js
npm run start:dist   # node dist/server.js
```

### With Caddy (reverse proxy)

Run the Node server, then in a separate terminal:

```bash
caddy run --config Caddyfile
```

For automatic HTTPS, replace `:80` in `Caddyfile` with your domain:

```
api.example.com {
    reverse_proxy localhost:3000
}
```

### Docker

```bash
npm run docker:build   # docker build -t register-scraper .
npm run docker:run     # docker run -p 3000:3000 -v $(pwd)/../data:/data register-scraper
```

The Docker build automatically runs `preflight` and `build` inside the container before creating the runtime image. The final image is a slim Node 22 + Chromium container — no dev dependencies or source files are included.

---

## Build

### `npm run preflight`

Validates the project before bundling or deploying:

1. **Environment variables** — checks `PORT`, `BROWSER_HEADLESS`, `DATA_FOLDER` (warns if unset, uses defaults)
2. **Adapter coverage** — for every registered jurisdiction, verifies that all required methods are overridden (not base stubs)
   - `✓` implemented
   - `⚠` stub (warning — jurisdiction will throw at runtime if called)
   - `✗` broken (hard fail — blocks the build)
3. **Selectors** — verifies `searchInput` and `searchButton` are defined per adapter
4. **Data folder** — creates the output folder if missing and confirms it is writable

Stubs (`⚠`) are expected for jurisdictions not yet implemented. Adding a code to `FULLY_IMPLEMENTED` in `scripts/preflight.js` promotes its stubs to hard errors.

### `npm run build`

Runs `preflight` then bundles the server with **esbuild**:

- Entry point: `src/index.js`
- Output: `dist/server.js` (~3.8 MB, single ESM file)
- Playwright and Node built-ins are marked external (must be installed alongside the bundle)

### Dockerfile (two-stage)

| Stage | Base | What it does |
| --- | --- | --- |
| `builder` | `node:22-slim` | `npm ci` → `preflight` → `esbuild` bundle |
| `runtime` | `node:22-slim` | installs Chromium via Playwright, copies `dist/server.js` only |

---

## API Reference

### Health check

```
GET /health
```

**Response**

```json
{ "status": "ok", "timestamp": "2026-02-22T10:00:00.000Z" }
```

---

### POST /getAutocompleteSuggestions

Type a partial name into the search box and return the live autocomplete dropdown suggestions. Saves a viewport screenshot and JSON to `data/YYYY-MM-DD/`.

**Request**

```http
POST /getAutocompleteSuggestions
Content-Type: application/json

{
  "jurisdiction_code": "ee",
  "company_name": "abc"
}
```

| Field               | Type   | Required     | Description                                       |
| ------------------- | ------ | ------------ | ------------------------------------------------- |
| `jurisdiction_code` | string | No           | ISO 3166-1 alpha-2 country code (default: `"ee"`) |
| `company_name`      | string | One of these | Partial company name to type                      |
| `company_number`    | string | One of these | Partial registry code to type                     |

**Response — 200 OK**

```json
{
  "jurisdiction_code": "ee",
  "query": "abc",
  "suggestions": [
    { "text": "ABC Abiteenused OÜ" },
    { "text": "ABC Aknad OÜ" },
    { "text": "ABC Arve OÜ" },
    { "text": "ABC Arveldused OÜ" },
    { "text": "Abc Asfalt OÜ" },
    { "text": "ABC AUTO GRUPP OÜ" },
    { "text": "ABC Autokool OÜ" },
    { "text": "ABC Autoteenindus OÜ" },
    { "text": "OÜ ABC Analytics" },
    { "text": "OÜ ABC Antenn" }
  ]
}
```

**Response — 404 Not Found**

```json
{ "error": "No autocomplete suggestions found.", "query": "abc" }
```

**Saved files**

```
data/
└── 2026-02-22/
    └── ee/
        ├── autocomplete-abc.jpg    ← viewport screenshot with dropdown open
        └── autocomplete-abc.json  ← suggestions list
```

---

### POST /getCompanyByNameOrNumber

Submit a full search and return all matching companies from the results page. Saves a full-page screenshot and JSON to `data/YYYY-MM-DD/`.

The Estonia adapter handles two result layouts automatically:
- **Card layout** — exact matches or small result sets
- **Table layout** — broad queries that return many results (e.g. `"OPERATIONS"`)

**Request**

```http
POST /getCompanyByNameOrNumber
Content-Type: application/json

{
  "jurisdiction_code": "ee",
  "company_name": "BOLT OPERATIONS OÜ"
}
```

| Field               | Type   | Required     | Description                                       |
| ------------------- | ------ | ------------ | ------------------------------------------------- |
| `jurisdiction_code` | string | No           | ISO 3166-1 alpha-2 country code (default: `"ee"`) |
| `company_name`      | string | One of these | Company name to search                            |
| `company_number`    | string | One of these | Registry code to search                           |

At least one of `company_name` or `company_number` must be provided. If both are given, `company_name` takes precedence.

**Response — 200 OK**

Always returns an object with `query`, `count`, and `results` array — regardless of how many matches were found (including zero).

```json
{
  "query": "BOLT OPERATIONS OÜ",
  "count": 1,
  "results": [
    {
      "jurisdiction_code": "ee",
      "company_name": "Bolt Operations OÜ",
      "company_number": "14532901",
      "address": "Harju maakond, Tallinn, Kesklinna linnaosa, Vana-Lõuna tn 15, 10134",
      "status": "Entered into the register (25.07.2018)",
      "url": "https://ariregister.rik.ee/eng/company/14532901/..."
    }
  ]
}
```

**Broad query example — many results**

```json
{
  "query": "OPERATIONS",
  "count": 47,
  "results": [
    { "jurisdiction_code": "ee", "company_name": "Bolt Operations OÜ", "company_number": "14532901", ... },
    { "jurisdiction_code": "ee", "company_name": "Elmo Operations OÜ", "company_number": "16123456", ... },
    ...
  ]
}
```

**No results**

```json
{ "query": "XYZNOTFOUND", "count": 0, "results": [] }
```

**Saved files**

```
data/
└── 2026-02-22/
    └── ee/
        ├── search-BOLT OPERATIONS OÜ.jpg    ← full-page search results screenshot
        └── search-BOLT OPERATIONS OÜ.json  ← results list
```

---

### POST /getCompleteInfo

Navigate directly to a company detail page by URL. Extracts structured data, saves a full-page screenshot and a JSON file to `data/YYYY-MM-DD/`.

**Request**

```http
POST /getCompleteInfo
Content-Type: application/json

{
  "jurisdiction_code": "ee",
  "url": "https://ariregister.rik.ee/eng/company/14532901/Bolt-Operations-O%C3%9C"
}
```

| Field               | Type   | Required | Description                                       |
| ------------------- | ------ | -------- | ------------------------------------------------- |
| `jurisdiction_code` | string | No       | ISO 3166-1 alpha-2 country code (default: `"ee"`) |
| `url`               | string | Yes      | Full URL of the company detail page               |

> Tip: get the URL from `POST /getCompanyByNameOrNumber` → `results[n].url`

**Response — 200 OK**

```json
{
  "company_name": "Bolt Operations OÜ",
  "company_number": "14532901",
  "jurisdiction_ident": "EE102090374",
  "incorporation_date": "25.07.2018",
  "dissolution_date": "",
  "company_type": "Private limited company",
  "current_status": "Entered into the register",
  "more_info_available": true,
  "ultimate_beneficial_owners": [
    {
      "name": "Markus Villig",
      "position": null,
      "entityType": null,
      "type_of_control": "Control or influence through other means (contractual, family relations etc)"
    }
  ],
  "officers": [
    {
      "name": "Ahto Kink",
      "position": "Management board member",
      "entityType": null
    }
  ],
  "shareholders": [
    {
      "name": "Omanikukonto: Bolt Holdings OÜ",
      "shares": "100.00%",
      "shareCount": null,
      "entityType": null,
      "type_of_control": "Sole ownership"
    }
  ]
}
```

**Saved files**

```
data/
└── 2026-02-22/
    └── ee/
        ├── Bolt Operations OÜ.jpg    ← full-page screenshot
        └── Bolt Operations OÜ.json  ← structured JSON result
```

---

## Typical workflow

```bash
# Step 0 (optional) — get autocomplete suggestions while typing
printf '{"jurisdiction_code":"ee","company_name":"abc"}' > q.json
curl -X POST http://localhost:3000/getAutocompleteSuggestions \
     -H "Content-Type: application/json" -d @q.json

# Step 1 — submit search and get the company URL
printf '{"jurisdiction_code":"ee","company_name":"BOLT OPERATIONS O\xc3\x9c"}' > search.json
curl -X POST http://localhost:3000/getCompanyByNameOrNumber \
     -H "Content-Type: application/json; charset=utf-8" -d @search.json

# Step 2 — fetch full details using the URL from step 1
printf '{"jurisdiction_code":"ee","url":"https://ariregister.rik.ee/eng/company/14532901/Bolt-Operations-O%%C3%%9C"}' > detail.json
curl -X POST http://localhost:3000/getCompleteInfo \
     -H "Content-Type: application/json; charset=utf-8" -d @detail.json
```

> On Windows (Git Bash), write the payload to a file using `printf` to preserve UTF-8 encoding, then pass the file with `-d @file`.

---

## cURL examples

### Autocomplete suggestions (Estonia)

```bash
curl -X POST http://localhost:3000/getAutocompleteSuggestions \
  -H "Content-Type: application/json" \
  -d '{"jurisdiction_code":"ee","company_name":"abc"}'
```

### Search by company name or number (Estonia)

```bash
curl -X POST http://localhost:3000/getCompanyByNameOrNumber \
  -H "Content-Type: application/json" \
  -d '{"jurisdiction_code":"ee","company_name":"Bolt Operations"}'
```

### Full detail page crawl (Estonia)

```bash
curl -X POST http://localhost:3000/getCompleteInfo \
  -H "Content-Type: application/json" \
  -d '{"jurisdiction_code":"ee","url":"https://ariregister.rik.ee/eng/company/14532901/Bolt-Operations-O%C3%9C"}'
```

---

## Configuration

All options are set via `.env`:

| Variable             | Default      | Description                                         |
| -------------------- | ------------ | --------------------------------------------------- |
| `PORT`               | `3000`       | HTTP port the server listens on                     |
| `DATA_FOLDER`        | `../data`    | Output folder for screenshots and JSON              |
| `BROWSER_HEADLESS`   | `true`       | Set to `false` to watch the browser during scraping |
| `USER_AGENT`         | Chrome 131   | Browser user agent string                           |
| `FIELD_REGISTRY_CODE`| `Registry code` | Label for the company number field (EE)          |
| `FIELD_VAT_NUMBER`   | `VAT number` | Label for the VAT identifier field (EE)             |
| `FIELD_INCORPORATED` | `Registered` | Label for the incorporation date field (EE)         |
| `FIELD_LEGAL_FORM`   | `Legal form` | Label for the company type field (EE)               |
| `FIELD_STATUS`       | `Status`     | Label for the current status field (EE)             |
| `WANTED_SECTIONS`    | all 12       | Comma-separated list of detail sections to extract (EE) |

> CSS selectors (`SELECTOR_*`) are no longer global env vars — they are defined per adapter in `src/jurisdictions/<code>.js`.

---

## Jurisdictions

Each jurisdiction is a self-contained adapter in `src/jurisdictions/`. The registry of adapters lives in `config/jurisdictions.js`.

| Code | Country   | Status    | Registry URL                      |
| ---- | --------- | --------- | --------------------------------- |
| `ee` | Estonia   | **Full**  | https://ariregister.rik.ee        |
| `lv` | Latvia    | Stub      | https://www.ur.gov.lv             |
| `lt` | Lithuania | Stub      | https://www.registrucentras.lt    |
| `fi` | Finland   | Stub      | https://www.ytj.fi                |
| `se` | Sweden    | Stub      | https://www.bolagsverket.se       |
| `dk` | Denmark   | Stub      | https://datacvr.virk.dk           |
| `no` | Norway    | Stub      | https://www.brreg.no              |
| `de` | Germany   | Stub      | https://www.handelsregister.de    |
| `pl` | Poland    | Stub      | https://ekrs.ms.gov.pl            |

**Full** — all adapter methods implemented, tested, and passing preflight.
**Stub** — adapter registered, URLs and selectors defined, HTML extraction not yet implemented. Calling `/getCompleteInfo` for a stub jurisdiction will return a 500 error.

---

## Error Responses

All errors follow the same shape:

```json
{ "error": "Human-readable message.", "details": "Optional stack or cause." }
```

| Status | Meaning                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | Missing or invalid request body field                                             |
| `404`  | No results found (`/getAutocompleteSuggestions` only)                             |
| `500`  | Scraper error (network, selector change, timeout, stub adapter called)            |

> **Note:** `POST /getCompanyByNameOrNumber` always returns `200` — zero results are expressed as `{ "count": 0, "results": [] }` rather than a `404`.
