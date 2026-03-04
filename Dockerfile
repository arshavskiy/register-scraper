# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Run preflight checks (validates all adapters before bundling)
RUN node scripts/preflight.js

# Bundle into dist/server.js
RUN node scripts/build.js

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

# Playwright system dependencies (Chromium)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libnspr4 \
    fonts-liberation \
    wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Only install production deps + playwright browser in the runtime stage
COPY package*.json ./
RUN npm ci --omit=dev

# Install Chromium via Playwright (only the browser, no test deps)
RUN npx playwright install chromium --with-deps

# Copy the bundle from the builder stage
COPY --from=builder /app/dist ./dist

# Data volume — screenshots and JSON output
VOLUME ["/data"]

# Defaults — all can be overridden at runtime via --env-file .env or -e PORT=...
ENV PORT=3000 \
    DATA_FOLDER=/data \
    BROWSER_HEADLESS=true \
    NODE_ENV=production

# Expose the default port — override with -p <host>:<container> if PORT is changed
EXPOSE 3000

CMD ["node", "dist/server.js"]
