import { chromium } from "playwright";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import JURISDICTION_ENDPOINTS from "./config/jurisdictions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_JURISDICTION = "ee";

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

function resolveJurisdictionEndpoints(code) {
  const normalized = (code || DEFAULT_JURISDICTION).toLowerCase();
  const fallback = JURISDICTION_ENDPOINTS.ee;

  switch (normalized) {
    case "lv":
      return JURISDICTION_ENDPOINTS.lv ?? fallback;
    case "lt":
      return JURISDICTION_ENDPOINTS.lt ?? fallback;
    case "fi":
      return JURISDICTION_ENDPOINTS.fi ?? fallback;
    case "ee":
    default:
      return fallback;
  }
}

function getConfig(jurisdictionCode = DEFAULT_JURISDICTION) {
  const rawSections = process.env.WANTED_SECTIONS;
  const wantedSections =
    rawSections && rawSections.trim()
      ? rawSections
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : DEFAULT_SECTIONS;

  const endpoints = resolveJurisdictionEndpoints(jurisdictionCode);
  const baseUrl = process.env.BASE_URL || endpoints.baseUrl;
  const searchUrl = process.env.SEARCH_URL || endpoints.searchUrl;

  return {
    baseUrl,
    searchUrl,
    selectedJurisdiction: jurisdictionCode,
    browserOptions: { headless: process.env.BROWSER_HEADLESS !== "false" },
    selectors: {
      searchInput: process.env.SELECTOR_SEARCH_INPUT || "input#company_search",
      searchButton: process.env.SELECTOR_SEARCH_BUTTON || "button.btn-search",
      resultRow: process.env.SELECTOR_RESULT_ROW || "table tbody tr",
      autocompleteDropdown:
        process.env.SELECTOR_AUTOCOMPLETE_DROPDOWN ||
        ".typeahead[role='listbox']",
      autocompleteItem:
        process.env.SELECTOR_AUTOCOMPLETE_ITEM || ".typeahead [role='option']",
    },
    userAgent:
      process.env.USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    wantedSections,
    fieldMap: {
      registryCode: process.env.FIELD_REGISTRY_CODE || "Registry code",
      vatNumber: process.env.FIELD_VAT_NUMBER || "VAT number",
      incorporated: process.env.FIELD_INCORPORATED || "Registered",
      legalForm: process.env.FIELD_LEGAL_FORM || "Legal form",
      status: process.env.FIELD_STATUS || "Status",
    },
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
    let label = $row
      .find(".text-muted, .col-md-4, .col-4")
      .first()
      .text()
      .trim();
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
  return clone
    .text()
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
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
      const value = $(row)
        .find(".col.font-weight-bold")
        .text()
        .replace(/\s+/g, " ")
        .trim();
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

function getOutputFolder(jurisdictionCode = DEFAULT_JURISDICTION) {
  const dataFolder = process.env.DATA_FOLDER || "../data";
  const dateFolder = getTodayDate();
  const jCode = (jurisdictionCode || DEFAULT_JURISDICTION).toLowerCase();
  const folderPath = path.join(dataFolder, dateFolder, jCode);
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

async function launchPage(jurisdictionCode = DEFAULT_JURISDICTION) {
  const config = getConfig(jurisdictionCode);
  console.log(
    "[launchPage] Launching browser",
    "jurisdiction",
    jurisdictionCode,
    "searchUrl",
    config.searchUrl,
  );
  const browser = await chromium.launch(config.browserOptions);
  const page = await browser.newPage({ userAgent: config.userAgent });
  console.log("[launchPage] Browser and page launched successfully");
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
  console.log("[runSearch] Navigating to search URL:", config.searchUrl);
  await page.goto(config.searchUrl, { waitUntil: "networkidle" });
  await acceptCookiesIfPresent(page);
  console.log(
    "[runSearch] Waiting for search input selector:",
    config.selectors.searchInput,
  );
  await page.waitForSelector(config.selectors.searchInput);
  console.log("[runSearch] Filling search query:", query);
  await page.fill(config.selectors.searchInput, query);
  console.log(
    "[runSearch] Clicking search button:",
    config.selectors.searchButton,
  );
  await page.click(config.selectors.searchButton);
  await page.waitForTimeout(1500);
  console.log("[runSearch] Search completed");
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Search by company name or registry number.
 * Returns a list of matching results from the search results page.
 */
async function getCompanyByNameOrNumber(
  query,
  jurisdictionCode = DEFAULT_JURISDICTION,
) {
  const normalizedJurisdiction = (
    jurisdictionCode || DEFAULT_JURISDICTION
  ).toLowerCase();
  console.log(
    "[getCompanyByNameOrNumber] Starting search for:",
    query,
    "jurisdiction",
    normalizedJurisdiction,
  );
  const { browser, page, config } = await launchPage(normalizedJurisdiction);

  try {
    await runSearch(page, config, query);
    console.log(
      "[getCompanyByNameOrNumber] Search executed, waiting for results...",
      normalizedJurisdiction,
    );

    try {
      await page.waitForSelector("a.h2.text-primary", {
        state: "attached",
        timeout: 5000,
      });
      console.log("[getCompanyByNameOrNumber] Results found on page");
    } catch {
      console.log(
        "[getCompanyByNameOrNumber] No results found (timeout waiting for results)",
        normalizedJurisdiction,
      );
      return [];
    }

    const html = await page.content();
    const results = extractSearchResults(html, config.baseUrl);
    console.log(
      "[getCompanyByNameOrNumber] Extracted",
      results.length,
      "results",
      normalizedJurisdiction,
    );

    if (results.length > 0) {
      const folderPath = getOutputFolder(normalizedJurisdiction);
      const safeName = `search-${sanitizeFilename(query)}`;
      await page.screenshot({
        path: path.join(folderPath, `${safeName}.jpg`),
        fullPage: true,
      });
      try {
        saveJsonFile(path.join(folderPath, `${safeName}.json`), results);
      } catch (err) {
        console.error("[saveJsonFile] Failed to save JSON:", err);
        fs.writeFileSync(
          path.join(folderPath, `${safeName}.json`),
          JSON.stringify(
            { error: "Failed to serialize results", details: String(err) },
            null,
            2,
          ),
          "utf8",
        );
      }
      console.log(`[saved] ${folderPath}/${safeName}.{jpg,json}`);
    }

    return results;
  } catch (err) {
    console.error("[getCompanyByNameOrNumber] Error:", err.message);
    throw err;
  } finally {
    await browser.close();
    console.log(
      "[getCompanyByNameOrNumber] Browser closed for jurisdiction",
      normalizedJurisdiction,
    );
  }
}

/**
 * Navigate directly to a company detail URL and return the structured response.
 * Takes a screenshot and saves JSON to ./data/YYYY-MM-DD/.
 */
async function scrapeByUrl(url, jurisdictionCode = DEFAULT_JURISDICTION) {
  const normalizedJurisdiction = (
    jurisdictionCode || DEFAULT_JURISDICTION
  ).toLowerCase();
  console.log(
    "[scrapeByUrl] Starting scrape for URL:",
    url,
    "jurisdiction",
    normalizedJurisdiction,
  );
  const { browser, page, config } = await launchPage(normalizedJurisdiction);

  try {
    console.log("[scrapeByUrl] Navigating to URL...");
    await page.goto(url, { waitUntil: "networkidle" });

    // Capture title before accepting cookies — accepting triggers a full page reload
    const pageTitle = await page.title();
    const companyName = pageTitle.split("|")[0].trim();
    console.log(
      "[scrapeByUrl] Page title:",
      pageTitle,
      "-> Company name:",
      companyName,
    );

    console.log("[scrapeByUrl] Accepting cookies if present...");
    await acceptCookiesIfPresent(page);
    // After cookie acceptance the page reloads — wait for company content to appear
    console.log("[scrapeByUrl] Waiting for card-body selector...");
    await page.waitForSelector(".card-body", { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    console.log("[scrapeByUrl] Page loaded and ready");

    const html = await page.content();
    console.log("[scrapeByUrl] Extracting sections from HTML...");
    const sections = extractAllSections(
      html,
      config.wantedSections,
      config.baseUrl,
    );
    console.log("[scrapeByUrl] Extracted", sections.length, "sections");
    const general = sections.find((s) => s.title === "General information");
    const vat = sections.find((s) => s.title === "VAT information");

    // Officers — #representativesTable
    console.log("[scrapeByUrl] Extracting officers...");
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
    console.log("[scrapeByUrl] Extracted", officers.length, "officers");

    // Shareholders — table whose first header is "Participation"
    console.log("[scrapeByUrl] Extracting shareholders...");
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
    console.log("[scrapeByUrl] Extracted", shareholders.length, "shareholders");

    // Beneficial owners — #beneficiaries-table
    console.log("[scrapeByUrl] Extracting beneficial owners...");
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
    console.log(
      "[scrapeByUrl] Extracted",
      ultimate_beneficial_owners.length,
      "beneficial owners",
    );

    const { fieldMap } = config;
    const result = {
      company_name: companyName,
      company_number: general?.fields[fieldMap.registryCode] ?? "",
      jurisdiction_ident: vat?.fields[fieldMap.vatNumber] ?? "",
      incorporation_date: general?.fields[fieldMap.incorporated] ?? "",
      dissolution_date: "",
      company_type: general?.fields[fieldMap.legalForm] ?? "",
      current_status: general?.fields[fieldMap.status] ?? "",
      more_info_available: sections.length > 0,
      ultimate_beneficial_owners,
      officers,
      shareholders,
    };

    const folderPath = getOutputFolder(normalizedJurisdiction);
    const safeName = sanitizeFilename(companyName || "company");
    console.log("[scrapeByUrl] Saving screenshot and JSON to:", folderPath);
    await page.screenshot({
      path: path.join(folderPath, `${safeName}.jpg`),
      fullPage: true,
    });
    try {
      saveJsonFile(path.join(folderPath, `${safeName}.json`), result);
    } catch (err) {
      console.error("[saveJsonFile] Failed to save JSON:", err);
      fs.writeFileSync(
        path.join(folderPath, `${safeName}.json`),
        JSON.stringify(
          { error: "Failed to serialize result", details: String(err) },
          null,
          2,
        ),
        "utf8",
      );
    }
    console.log(`[saved] ${folderPath}/${safeName}.{jpg,json}`);

    return result;
  } catch (err) {
    console.error("[scrapeByUrl] Error:", err.message);
    throw err;
  } finally {
    await browser.close();
    console.log(
      "[scrapeByUrl] Browser closed for jurisdiction",
      normalizedJurisdiction,
    );
  }
}

/**
 * Type a query into the search box and capture the autocomplete dropdown list
 * that appears before the search is submitted. Saves screenshot + JSON to data/.
 */
async function getAutocompleteSuggestions(
  query,
  jurisdictionCode = DEFAULT_JURISDICTION,
) {
  const normalizedJurisdiction = (
    jurisdictionCode || DEFAULT_JURISDICTION
  ).toLowerCase();
  console.log(
    "[getAutocompleteSuggestions] Starting autocomplete for query:",
    query,
    "jurisdiction",
    normalizedJurisdiction,
  );
  const { browser, page, config } = await launchPage(normalizedJurisdiction);

  try {
    console.log("[getAutocompleteSuggestions] Navigating to search URL...");
    await page.goto(config.searchUrl, { waitUntil: "networkidle" });
    await acceptCookiesIfPresent(page);
    console.log("[getAutocompleteSuggestions] Waiting for search input...");
    await page.waitForSelector(config.selectors.searchInput);

    // Type character-by-character with a small delay to trigger autocomplete
    console.log(
      "[getAutocompleteSuggestions] Clicking search input and typing query...",
    );
    await page.click(config.selectors.searchInput);
    await page.type(config.selectors.searchInput, query, { delay: 80 });

    // Wait for the dropdown to become visible
    console.log(
      "[getAutocompleteSuggestions] Waiting for autocomplete dropdown...",
    );
    try {
      await page.waitForSelector(config.selectors.autocompleteDropdown, {
        state: "visible",
        timeout: 4000,
      });
      console.log("[getAutocompleteSuggestions] Dropdown appeared");
    } catch {
      console.log(
        "[getAutocompleteSuggestions] No dropdown appeared for query:",
        query,
      );
      return [];
    }

    console.log("[getAutocompleteSuggestions] Extracting suggestions...");
    const suggestions = await page
      .$$eval(config.selectors.autocompleteItem, (items) =>
        items
          .map((item) => {
            const text = (item.textContent ?? "").trim().replace(/\s+/g, " ");
            return text ? { text } : null;
          })
          .filter(Boolean),
      )
      .catch(() => []);
    console.log(
      "[getAutocompleteSuggestions] Extracted",
      suggestions.length,
      "suggestions",
    );

    const folderPath = getOutputFolder(normalizedJurisdiction);
    const safeName = `autocomplete-${sanitizeFilename(query)}`;
    console.log(
      "[getAutocompleteSuggestions] Saving screenshot and JSON to:",
      folderPath,
    );
    await page.screenshot({
      path: path.join(folderPath, `${safeName}.jpg`),
      fullPage: false,
    });
    try {
      saveJsonFile(path.join(folderPath, `${safeName}.json`), suggestions);
    } catch (err) {
      console.error("[saveJsonFile] Failed to save JSON:", err);
      fs.writeFileSync(
        path.join(folderPath, `${safeName}.json`),
        JSON.stringify(
          { error: "Failed to serialize suggestions", details: String(err) },
          null,
          2,
        ),
        "utf8",
      );
    }
    console.log(`[saved] ${folderPath}/${safeName}.{jpg,json}`);

    return suggestions;
  } catch (err) {
    console.error("[getAutocompleteSuggestions] Error:", err.message);
    throw err;
  } finally {
    await browser.close();
    console.log(
      "[getAutocompleteSuggestions] Browser closed for jurisdiction",
      normalizedJurisdiction,
    );
  }
}

export { getCompanyByNameOrNumber, getAutocompleteSuggestions, scrapeByUrl };
