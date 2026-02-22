# Estonian Business Register — API Server

A Node.js REST API that wraps the Estonian Business Register scraper and exposes it over HTTP. Designed to run behind a **Caddy** reverse proxy.

---

## Stack

| Layer              | Technology              |
| ------------------ | ----------------------- |
| Runtime            | Node.js                 |
| Language           | JavaScript (ES modules) |
| HTTP server        | Express                 |
| Browser automation | Playwright (Chromium)   |
| HTML parsing       | Cheerio                 |
| Reverse proxy      | Caddy                   |

---

## Project Structure

```
register-scraper/
├── src/
│   ├── index.js              # Express app entry point
│   ├── scraper.js            # Playwright + Cheerio scraping logic
│   ├── controllers/
│   │   └── companyController.js  # Request validation + logging
│   ├── routes/
│   │   └── company.js        # Router wiring to controllers
│   └── config/
│       └── jurisdictions.js  # ISO 3166-1 alpha-2 endpoints
├── package.json
├── Caddyfile
└── .env.example

# Output is written to the data folder:
data/
└── YYYY-MM-DD/
    ├── search-<query>.jpg          ← search results screenshot
    ├── search-<query>.json         ← search results list
    ├── autocomplete-<query>.jpg    ← autocomplete dropdown screenshot
    ├── autocomplete-<query>.json   ← autocomplete suggestions list
    ├── CompanyName.jpg             ← full-page company screenshot
    └── CompanyName.json            ← structured company JSON
```

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
    ├── autocomplete-abc.jpg    ← viewport screenshot with dropdown open
    └── autocomplete-abc.json  ← suggestions list
```

---

### POST /getCompanyByNameOrNumber

Submit a full search and return all matching companies from the results page. Saves a full-page screenshot and JSON to `data/YYYY-MM-DD/`.

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

**Saved files**

```
data/
└── 2026-02-22/
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

Use the following commands to exercise each endpoint directly from a terminal:

### Autocomplete suggestions (Estonia)

```bash
curl -X POST http://localhost:3000/getAutocompleteSuggestions \
  -H "Content-Type: application/json" \
  -d '{"jurisdiction_code":"ee","company_name":"abc"}'
```

### Search by company name or number (Latvia)

```bash
curl -X POST http://localhost:3000/getCompanyByNameOrNumber \
  -H "Content-Type: application/json" \
  -d '{"jurisdiction_code":"lv","company_name":"Latvijas Zenit V"}'
```

### Full detail page crawl (Estonia)

```bash
curl -X POST http://localhost:3000/getCompleteInfo \
  -H "Content-Type: application/json" \
  -d '{"jurisdiction_code":"ee","url":"https://ariregister.rik.ee/eng/company/14532901/Bolt-Operations-O%C3%9C"}'
```

## Configuration

All options are set via `.env`:

| Variable                         | Default                          | Description                                       |
| -------------------------------- | -------------------------------- | ------------------------------------------------- |
| `PORT`                           | `3000`                           | HTTP port the server listens on                   |
| `BASE_URL`                       | `https://ariregister.rik.ee`     | Registry base URL                                 |
| `SEARCH_URL`                     | `https://ariregister.rik.ee/eng` | Search page URL                                   |
| `DATA_FOLDER`                    | `../data`                        | Output folder for screenshots and JSON            |
| `BROWSER_HEADLESS`               | `true`                           | Set to `false` to watch the browser               |
| `USER_AGENT`                     | Chrome 131 UA string             | Browser user agent                                |
| `SELECTOR_SEARCH_INPUT`          | `input#company_search`           | Search field selector                             |
| `SELECTOR_SEARCH_BUTTON`         | `button.btn-search`              | Search submit button selector                     |
| `SELECTOR_AUTOCOMPLETE_DROPDOWN` | `.typeahead[role='listbox']`     | Autocomplete dropdown container                   |
| `SELECTOR_AUTOCOMPLETE_ITEM`     | `.typeahead [role='option']`     | Autocomplete item selector                        |
| `WANTED_SECTIONS`                | all 12 sections                  | Comma-separated list of sections to extract       |
| `FIELD_REGISTRY_CODE`            | `Registry code`                  | Label for the company number field                |
| `FIELD_VAT_NUMBER`               | `VAT number`                     | Label for the VAT / jurisdiction identifier field |
| `FIELD_INCORPORATED`             | `Registered`                     | Label for the incorporation date field            |
| `FIELD_LEGAL_FORM`               | `Legal form`                     | Label for the company type field                  |
| `FIELD_STATUS`                   | `Status`                         | Label for the current status field                |

---

## Jurisdictions

The scraper resolves the correct registry URLs per ISO 3166-1 alpha-2 code using `src/config/jurisdictions.js`. The list shipped with the project covers all Baltic registries we support today:

| Code | Description       | Base URL                       | Search URL                                 |
| ---- | ----------------- | ------------------------------ | ------------------------------------------ |
| `ee` | Estonia (default) | https://ariregister.rik.ee     | https://ariregister.rik.ee/eng             |
| `lv` | Latvia            | https://www.ur.gov.lv          | https://www.ur.gov.lv/lv/search            |
| `lt` | Lithuania         | https://www.registrucentras.lt | https://www.registrucentras.lt/jar/paieska |
| `fi` | Finland           | https://www.ytj.fi             | https://www.ytj.fi/en/yrityshaku           |

Adding or overriding a code is as easy as editing that file and declaring a new `baseUrl` / `searchUrl` pair; the scraper automatically picks up the new code as soon as you redeploy.

---

## Error Responses

All errors follow the same shape:

```json
{ "error": "Human-readable message.", "details": "Optional stack or cause." }
```

| Status | Meaning                                           |
| ------ | ------------------------------------------------- |
| `400`  | Missing or invalid request body field             |
| `404`  | No results found for the given query              |
| `500`  | Scraper error (network, selector change, timeout) |
