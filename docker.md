# Docker Guide

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- `.env` file created from the example (see step 1 below)

---

## Quick Start

```bash
# 1. Create your .env
cp .env.example .env

# 2. Build the image
npm run docker:build

# 3. Run the container
npm run docker:run
```

---

## Step 1 — Create `.env`

```bash
cp .env.example .env
```

Open `.env` and set `DATA_FOLDER` to `/data` (the container's mounted volume):

```env
PORT=3000
DATA_FOLDER=/data          # ← must be /data inside Docker (not ../data)
BROWSER_HEADLESS=true
```

> For local development (without Docker) keep `DATA_FOLDER=../data`.

---

## Step 2 — Build the image

```bash
npm run docker:build
# equivalent:
docker build -t register-scraper .
```

The build runs two stages:

| Stage | What happens |
| --- | --- |
| `builder` | `npm ci` → preflight validation → esbuild bundle → `dist/server.js` |
| `runtime` | Slim Node 22 + Chromium only, no source files or dev dependencies |

First build takes a few minutes (Chromium download). Subsequent builds are cached.

---

## Step 3 — Run the container

```bash
npm run docker:run
# equivalent:
docker run --env-file .env \
  -p 3000:3000 \
  -v "$(pwd)/../data":/data \
  register-scraper
```

| Flag | Purpose |
| --- | --- |
| `--env-file .env` | Injects all `.env` values into the container at runtime |
| `-p 3000:3000` | Maps host port → container port (both read from `PORT` in `.env`) |
| `-v $(pwd)/../data:/data` | Mounts the data folder — screenshots and JSON are written to your host machine |

---

## Step 4 — Test it

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}

curl -X POST http://localhost:3000/getCompanyByNameOrNumber \
  -H "Content-Type: application/json" \
  -d '{"jurisdiction_code":"ee","company_name":"Bolt Operations"}'
```

---

## Changing the port

Set `PORT` in `.env` — the run script picks it up automatically via `${PORT:-3000}`:

```env
PORT=3001
```

```bash
npm run docker:run
# runs: docker run --env-file .env -p 3001:3001 ...
```

---

## Run detached (background)

```bash
docker run -d --name scraper \
  --env-file .env \
  -p 3000:3000 \
  -v "$(pwd)/../data":/data \
  register-scraper
```

Useful commands once running:

```bash
docker logs -f scraper     # follow logs
docker stop scraper        # stop the container
docker start scraper       # restart it
docker rm scraper          # remove the container
```

---

## Rebuild after code changes

```bash
npm run docker:build && npm run docker:run
```

---

## Environment variables

All variables can be set in `.env` and are injected via `--env-file`. The image ships with these defaults (overridden by `.env` at runtime):

| Variable             | Image default | Description                                         |
| -------------------- | ------------- | --------------------------------------------------- |
| `PORT`               | `3000`        | HTTP port the server listens on                     |
| `DATA_FOLDER`        | `/data`       | Output folder — set to `/data` to use the volume    |
| `BROWSER_HEADLESS`   | `true`        | Always `true` in Docker (no display available)      |
| `NODE_ENV`           | `production`  | Node environment                                    |
| `USER_AGENT`         | Chrome 131    | Browser user agent string                           |
| `FIELD_REGISTRY_CODE`| `Registry code` | EE field label — company number                  |
| `FIELD_VAT_NUMBER`   | `VAT number`  | EE field label — VAT identifier                     |
| `FIELD_INCORPORATED` | `Registered`  | EE field label — incorporation date                 |
| `FIELD_LEGAL_FORM`   | `Legal form`  | EE field label — company type                       |
| `FIELD_STATUS`       | `Status`      | EE field label — current status                     |
| `WANTED_SECTIONS`    | all 12        | Comma-separated detail sections to extract (EE)     |

---

## Data output

Scraped screenshots and JSON files are written to the mounted volume:

```
data/
└── YYYY-MM-DD/
    └── ee/
        ├── search-<query>.jpg
        ├── search-<query>.json
        ├── autocomplete-<query>.jpg
        ├── autocomplete-<query>.json
        ├── CompanyName.jpg
        └── CompanyName.json
```

On the host machine this resolves to `../data/` relative to the project root (or wherever you point `-v`).
