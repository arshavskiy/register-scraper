# Estonian Business Register — API Server

A Node.js REST API that wraps the Estonian Business Register scraper and exposes it over HTTP. Designed to run behind a **Caddy** reverse proxy.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | JavaScript (CommonJS) |
| HTTP server | Express |
| Browser automation | Playwright (Chromium) |
| HTML parsing | Cheerio |
| Reverse proxy | Caddy |

---

## Project Structure

```
server/
├── src/
│   ├── index.js          # Express app entry point
│   ├── scraper.js        # Playwright + Cheerio scraping logic
│   └── routes/
│       └── company.js    # POST /getCompanyByNameOrNumber, POST /getCompleteInfo
├── package.json
├── Caddyfile
└── .env.example

# Output is written to the shared project data folder:
../data/
└── YYYY-MM-DD/
    ├── CompanyName.jpg   ← full-page screenshot
    └── CompanyName.json  ← structured JSON result
```

---

## Setup

### 1. Install dependencies

```bash
cd server
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

Edit `.env` as needed — defaults work out of the box.

---

## Running

### Development (auto-restart on file change)

```bash
npm run dev
```

### Production

```bash
npm start
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

---

## API Reference

### Health check

```
GET /health
```

**Response**

```json
{ "status": "ok", "timestamp": "2026-02-21T10:00:00.000Z" }
```

---

### POST /getCompanyByNameOrNumber

Search the Estonian Business Register by company name or registry code. Returns a list of matching companies.

**Request**

```http
POST /getCompanyByNameOrNumber
Content-Type: application/json

{
  "jurisdiction_code": "ee",
  "company_name": "BOLT OPERATIONS OÜ"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `jurisdiction_code` | string | No | ISO 3166-1 alpha-2 country code (default: `"ee"`) |
| `company_name` | string | One of these | Company name to search |
| `company_number` | string | One of these | Registry code to search |

At least one of `company_name` or `company_number` must be provided. If both are given, `company_name` takes precedence.

**Response — 200 OK**

```json
[
  {
    "jurisdiction_code": "ee",
    "company_name": "Bolt Operations OÜ",
    "company_number": "14532901",
    "address": "Harju maakond, Tallinn, Kesklinna linnaosa, Vana-Lõuna tn 15, 10134",
    "status": "Entered into the register (25.07.2018)",
    "url": "https://ariregister.rik.ee/eng/company/14532901/..."
  }
]
```

**Response — 404 Not Found**

```json
{ "error": "No companies found.", "query": "..." }
```

---

### POST /getCompleteInfo

Navigate directly to a company detail page by URL. Extracts structured data, saves a full-page screenshot and a JSON file to `../data/YYYY-MM-DD/`.

**Request**

```http
POST /getCompleteInfo
Content-Type: application/json

{
  "jurisdiction_code": "ee",
  "url": "https://ariregister.rik.ee/eng/company/14532901/Bolt-Operations-O%C3%9C"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `jurisdiction_code` | string | No | ISO 3166-1 alpha-2 country code (default: `"ee"`) |
| `url` | string | Yes | Full URL of the company detail page |

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
    },
    {
      "name": "Vincent Roland Pickering",
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

Every successful call writes two files to the shared project data folder:

```
../data/
└── 2026-02-21/
    ├── Bolt Operations OÜ.jpg    ← full-page screenshot
    └── Bolt Operations OÜ.json  ← structured JSON result
```

---

## Typical two-step workflow

```bash
# Step 1 — find the company and get its URL
printf '{"jurisdiction_code":"ee","company_name":"BOLT OPERATIONS O\xc3\x9c"}' > search.json
curl -X POST http://localhost:3000/getCompanyByNameOrNumber \
     -H "Content-Type: application/json; charset=utf-8" \
     -d @search.json

# Step 2 — fetch full details using the URL from step 1
printf '{"jurisdiction_code":"ee","url":"https://ariregister.rik.ee/eng/company/14532901/Bolt-Operations-O%%C3%%9C"}' > detail.json
curl -X POST http://localhost:3000/getCompleteInfo \
     -H "Content-Type: application/json; charset=utf-8" \
     -d @detail.json
```

> On Windows (Git Bash), write the payload to a file using `printf` to preserve UTF-8 encoding, then pass the file with `-d @file`.

---

## Configuration

All options are set via `.env`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `BASE_URL` | `https://ariregister.rik.ee` | Registry base URL |
| `SEARCH_URL` | `https://ariregister.rik.ee/eng` | Search page URL |
| `DATA_FOLDER` | `../data` | Output folder for screenshots and JSON |
| `BROWSER_HEADLESS` | `true` | Set to `false` to watch the browser |
| `USER_AGENT` | Chrome 131 UA string | Browser user agent |
| `SELECTOR_SEARCH_INPUT` | `input#company_search` | Search field selector |
| `SELECTOR_SEARCH_BUTTON` | `button.btn-search` | Search submit button selector |
| `WANTED_SECTIONS` | all 12 sections | Comma-separated list of sections to extract |

---

## Error Responses

All errors follow the same shape:

```json
{ "error": "Human-readable message.", "details": "Optional stack or cause." }
```

| Status | Meaning |
|---|---|
| `400` | Missing or invalid request body field |
| `404` | No company found for the given query |
| `500` | Scraper error (network, selector change, timeout) |
