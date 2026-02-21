const { chromium } = require("playwright");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

// ============================================================================
// CONFIG
// ============================================================================

const DEFAULT_SECTIONS = [
  "General information",
  "VAT information",
  "Right of representation",
  "Contacts",
  "Shareholders",
  "Tax information",
  "Activity licenses and notices of economic activities",
  "Annual reports",
  "Areas of activity",
  "Articles of association",
  "Beneficial owners",
  "Data protection officer",
];

function getConfig() {
  const rawSections = process.env.WANTED_SECTIONS;
  const wantedSections =
    rawSections && rawSections.trim()
      ? rawSections.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_SECTIONS;

  return {
    baseUrl: process.env.BASE_URL || "https://ariregister.rik.ee",
    searchUrl: process.env.SEARCH_URL || "https://ariregister.rik.ee/eng",
    browserOptions: { headless: process.env.BROWSER_HEADLESS !== "false" },
    selectors: {
      searchInput: process.env.SELECTOR_SEARCH_INPUT || "input#company_search",
      searchButton: process.env.SELECTOR_SEARCH_BUTTON || "button.btn-search",
      resultRow: process.env.SELECTOR_RESULT_ROW || "table tbody tr",
    },
    userAgent:
      process.env.USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    wantedSections,
  };
}

// ============================================================================
// HTML EXTRACTION
// ============================================================================

function normalizeUrl(href, baseUrl) {
  if (!href || href === "#") return null;
  if (href.startsWith("/")) return baseUrl + href;
  return href;
}

function extractFields($, container) {
  const fields = {};

  container.find(".row").each((_, row) => {
    const $row = $(row);
    let label = $row.find(".text-muted, .col-md-4, .col-4").first().text().trim();
    let value = $row
      .find(".font-weight-bold, .col:not(.col-md-4):not(.text-muted)")
      .first()
      .text()
      .trim();

    if (!label) {
      const directDivs = $row.children("div");
      if (directDivs.length >= 2) {
        const firstDivText = $(directDivs[0]).text().trim();
        if (firstDivText.length < 60) {
          label = firstDivText;
          value = directDivs
            .slice(1)
            .map((_, div) => $(div).text().trim())
            .get()
            .join("\n");
        }
      }
    }

    if (label && value) {
      fields[label] = value;
    }
  });

  return fields;
}

function extractLinks($, container, baseUrl) {
  const links = [];

  container.find("a").each((_, a) => {
    const text = $(a).text().trim();
    const href = normalizeUrl($(a).attr("href") || "", baseUrl);
    if (href) links.push({ text, href });
  });

  return links;
}

function extractContent($, container) {
  const clone = container.clone();
  clone.find("h2, script, style, img").remove();
  return clone.text().replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim();
}

function extractAllSections(html, wantedSections, baseUrl) {
  const $ = cheerio.load(html);
  const wantedLowercase = wantedSections.map((s) => s.toLowerCase().trim());
  const sections = [];

  $(".h2").each((_, h2El) => {
    const title = $(h2El).text().trim();
    if (!title || !wantedLowercase.includes(title.toLowerCase())) return;

    const container = $(h2El).closest(".card-body");
    if (container.length === 0) return;

    sections.push({
      title,
      fields: extractFields($, container),
      content: extractContent($, container),
      links: extractLinks($, container, baseUrl),
    });
  });

  return sections;
}

function extractSearchResults(html, baseUrl) {
  const $ = cheerio.load(html);
  const results = [];

  $("a.h2.text-primary").each((_, a) => {
    const name = $(a).text().trim();
    const href = $(a).attr("href") || "";
    const url = normalizeUrl(href, baseUrl) || "";

    const codeMatch = href.match(/\/company\/(\d+)\//);
    let registryCode = codeMatch ? codeMatch[1] : "";
    let status = "";
    let address = "";

    const cardBody = $(a).closest(".card-body");
    cardBody.find(".row").each((_, row) => {
      const label = $(row).find(".col-md-2").text().trim();
      const value = $(row).find(".col.font-weight-bold").text().replace(/\s+/g, " ").trim();
      if (label === "Registry code" && !registryCode) registryCode = value;
      if (label === "Status") status = value;
      if (label === "Address") address = value;
    });

    if (name) results.push({ name, registryCode, status, address, url });
  });

  return results;
}

// ============================================================================
// FILE SYSTEM UTILITIES
// ============================================================================

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function getOutputFolder() {
  const dataFolder = process.env.DATA_FOLDER || "./data";
  const folderPath = path.join(dataFolder, getTodayDate());
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
}

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "-");
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ============================================================================
// BROWSER HELPERS
// ============================================================================

async function launchPage() {
  const config = getConfig();
  const browser = await chromium.launch(config.browserOptions);
  const page = await browser.newPage({ userAgent: config.userAgent });
  return { browser, page, config };
}

async function acceptCookiesIfPresent(page) {
  try {
    const btn = page.locator("button#accept-cookies").first();
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(800);
      console.log("[cookie] Accepted");
    }
  } catch {
    // No cookie banner present
  }
}

async function runSearch(page, config, query) {
  await page.goto(config.searchUrl, { waitUntil: "networkidle" });
  await acceptCookiesIfPresent(page);
  await page.waitForSelector(config.selectors.searchInput);
  await page.fill(config.selectors.searchInput, query);
  await page.click(config.selectors.searchButton);
  await page.waitForTimeout(1500);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Search by company name or registry number.
 * Returns a list of matching results from the search results page.
 */
async function getCompanyByNameOrNumber(query) {
  const { browser, page, config } = await launchPage();

  try {
    await runSearch(page, config, query);

    try {
      await page.waitForSelector("a.h2.text-primary", {
        state: "attached",
        timeout: 5000,
      });
    } catch {
      return [];
    }

    const html = await page.content();
    return extractSearchResults(html, config.baseUrl);
  } finally {
    await browser.close();
  }
}

/**
 * Navigate directly to a company detail URL and return the structured response.
 * Takes a screenshot and saves JSON to ./data/YYYY-MM-DD/.
 */
async function scrapeByUrl(url) {
  const { browser, page, config } = await launchPage();

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await acceptCookiesIfPresent(page);

    const pageTitle = await page.title();
    const companyName = pageTitle.split("|")[0].trim();

    const html = await page.content();
    const sections = extractAllSections(html, config.wantedSections, config.baseUrl);
    const general = sections.find((s) => s.title === "General information");
    const vat = sections.find((s) => s.title === "VAT information");

    // Officers — #representativesTable
    const officers = await page
      .$$eval("#representativesTable tbody tr", (rows) =>
        rows.map((row) => {
          const cells = [...row.querySelectorAll("td")].map(
            (td) => td.textContent?.trim() ?? "",
          );
          return { name: cells[0], position: cells[2], entityType: null };
        }),
      )
      .catch(() => []);

    // Shareholders — table whose first header is "Participation"
    const shareholders = await page
      .$$eval("table", (tables) => {
        for (const table of tables) {
          const headers = [
            ...(table.querySelector("thead")?.querySelectorAll("th") ?? []),
          ].map((th) => th.textContent?.trim());
          if (headers[0] !== "Participation") continue;
          return [...table.querySelectorAll("tbody tr")].map((row) => {
            const cells = [...row.querySelectorAll("td")].map(
              (td) => td.textContent?.trim().replace(/\s+/g, " ") ?? "",
            );
            const contribMatch = cells[1]?.match(/^[\d.,]+\s+EUR\s+(.*)/);
            return {
              name: cells[2] ?? "",
              shares: cells[0] ?? "",
              shareCount: null,
              entityType: null,
              type_of_control: contribMatch?.[1]?.trim() ?? cells[1] ?? "",
            };
          });
        }
        return [];
      })
      .catch(() => []);

    // Beneficial owners — #beneficiaries-table
    const ultimate_beneficial_owners = await page
      .$$eval("#beneficiaries-table tbody tr", (rows) =>
        rows.map((row) => {
          const cells = [...row.querySelectorAll("td")].map(
            (td) => td.textContent?.trim().replace(/\s+/g, " ") ?? "",
          );
          return {
            name: cells[0],
            position: null,
            entityType: null,
            type_of_control: cells[2],
          };
        }),
      )
      .catch(() => []);

    const result = {
      company_name: companyName,
      company_number: general?.fields["Registry code"] ?? "",
      jurisdiction_ident: vat?.fields["VAT number"] ?? "",
      incorporation_date: general?.fields["Registered"] ?? "",
      dissolution_date: "",
      company_type: general?.fields["Legal form"] ?? "",
      current_status: general?.fields["Status"] ?? "",
      more_info_available: sections.length > 0,
      ultimate_beneficial_owners,
      officers,
      shareholders,
    };

    const folderPath = getOutputFolder();
    const safeName = sanitizeFilename(companyName || "company");
    await page.screenshot({
      path: path.join(folderPath, `${safeName}.jpg`),
      fullPage: true,
    });
    saveJsonFile(path.join(folderPath, `${safeName}.json`), result);
    console.log(`[saved] ${folderPath}/${safeName}.{jpg,json}`);

    return result;
  } finally {
    await browser.close();
  }
}

module.exports = { getCompanyByNameOrNumber, scrapeByUrl };
