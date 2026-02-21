# Estonian Business Register — API Server

A Node.js + TypeScript REST API that wraps the Estonian Business Register scraper and exposes it over HTTP. Designed to run behind a **Caddy** reverse proxy.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| HTTP server | Express |
| Browser automation | Playwright (Chromium) |
| HTML parsing | Cheerio |
| Reverse proxy | Caddy |

---

## Project Structure

```
server/
├── src/
│   ├── index.ts          # Express app entry point
│   ├── scraper.ts        # Playwright + Cheerio scraping logic
│   └── routes/
│       └── company.ts    # POST /getCompanyByNameOrNumber, POST /getCompleteInfo
├── data/                 # Output folder (auto-created, gitignored)
│   └── YYYY-MM-DD/
│       ├── CompanyName.jpg
│       └── CompanyName.json
├── package.json
├── tsconfig.json
├── Caddyfile
└── .env.example
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

### Development (hot reload)

```bash
npm run dev
```

### Production

```bash
npm run build
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

Search the Estonian Business Register by company name or registry code. Returns a list of matching results.

**Request**

```http
POST /getCompanyByNameOrNumber
Content-Type: application/json

{
  "query": "BOLT OPERATIONS OÜ"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Company name or registry code |

**Response — 200 OK**

```json
{
  "query": "BOLT OPERATIONS OÜ",
  "total": 1,
  "results": [
    {
      "name": "Bolt Operations OÜ",
      "registryCode": "14532901",
      "status": "Entered into the register (25.07.2018)",
      "address": "Harju maakond, Tallinn, Kesklinna linnaosa, Vana-Lõuna tn 15, 10134",
      "url": "https://ariregister.rik.ee/eng/company/14532901/..."
    }
  ]
}
```

**Response — 404 Not Found**

```json
{ "error": "No companies found for the given query.", "query": "..." }
```

---

### POST /getCompleteInfo

Scrape the full detail page of a company. Extracts all available sections, saves a full-page screenshot and a JSON file to `./data/YYYY-MM-DD/`.

**Request**

```http
POST /getCompleteInfo
Content-Type: application/json

{
  "company": "BOLT OPERATIONS OÜ"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `company` | string | Yes | Exact company name as listed in the register |

**Response — 200 OK**

```json
{
  "name": "BOLT OPERATIONS OÜ",
  "sections": [
    {
      "title": "General information",
      "fields": {
        "Registry code": "14532901",
        "Legal form": "Private limited company",
        "Status": "Entered into the register",
        "Capital": "Capital is 2 701 €",
        "Registered": "25.07.2018"
      },
      "content": "Full plain-text content of the section...",
      "links": [
        { "text": "PDF", "href": "https://ariregister.rik.ee/eng/company/14532901/file/..." }
      ]
    }
  ]
}
```

**Sections extracted** (up to 12):

| # | Section |
|---|---|
| 1 | General information |
| 2 | VAT information |
| 3 | Right of representation |
| 4 | Contacts |
| 5 | Shareholders |
| 6 | Tax information |
| 7 | Activity licenses and notices of economic activities |
| 8 | Annual reports |
| 9 | Areas of activity |
| 10 | Articles of association |
| 11 | Beneficial owners |
| 12 | Data protection officer |

**Saved files**

Every successful call writes two files:

```
data/
└── 2026-02-21/
    ├── BOLT OPERATIONS OÜ.jpg    ← full-page screenshot
    └── BOLT OPERATIONS OÜ.json  ← structured JSON data
```

---

## Configuration

All options are set via `.env`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `BASE_URL` | `https://ariregister.rik.ee` | Registry base URL |
| `SEARCH_URL` | `https://ariregister.rik.ee/eng` | Search page URL |
| `DATA_FOLDER` | `./data` | Output folder for screenshots and JSON |
| `BROWSER_HEADLESS` | `true` | Set to `false` to watch the browser |
| `USER_AGENT` | Chrome 131 UA string | Browser user agent |
| `SELECTOR_SEARCH_INPUT` | `input#company_search` | Search field selector |
| `SELECTOR_SEARCH_BUTTON` | `button.btn-search` | Search submit button selector |
| `WANTED_SECTIONS` | all 12 sections | Comma-separated list of sections to extract |

---

## Testing with curl

On Windows, write the payload to a file to preserve UTF-8 encoding:

```bash
printf '{"query": "BOLT OPERATIONS O\xc3\x9c"}' > q1.json
curl -X POST http://localhost:3000/getCompanyByNameOrNumber \
     -H "Content-Type: application/json; charset=utf-8" \
     -d @q1.json

printf '{"company": "BOLT OPERATIONS O\xc3\x9c"}' > q2.json
curl -X POST http://localhost:3000/getCompleteInfo \
     -H "Content-Type: application/json; charset=utf-8" \
     -d @q2.json
```

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
