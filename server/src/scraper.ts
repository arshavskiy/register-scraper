import { chromium, Page } from "playwright";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

// ============================================================================
// TYPES
// ============================================================================

export interface Link {
  text: string;
  href: string;
}

export interface Section {
  title: string;
  fields: Record<string, string>;
  content: string;
  links: Link[];
}

export interface CompanySearchResult {
  name: string;
  registryCode: string;
  status: string;
  address: string;
  url: string;
}

export interface CompanyFullData {
  name: string;
  sections: Section[];
}

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
      ? rawSections
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : DEFAULT_SECTIONS;

  return {
    baseUrl: process.env.BASE_URL || "https://ariregister.rik.ee",
    searchUrl: process.env.SEARCH_URL || "https://ariregister.rik.ee/eng",
    browserOptions: { headless: process.env.BROWSER_HEADLESS !== "false" },
    selectors: {
      searchInput: process.env.SELECTOR_SEARCH_INPUT || "input#company_search",
      searchButton:
        process.env.SELECTOR_SEARCH_BUTTON || "button.btn-search",
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

function normalizeUrl(href: string, baseUrl: string): string | null {
  if (!href || href === "#") return null;
  if (href.startsWith("/")) return baseUrl + href;
  return href;
}

function extractFields(
  $: cheerio.CheerioAPI,
  container: ReturnType<ReturnType<typeof cheerio.load>>,
): Record<string, string> {
  const fields: Record<string, string> = {};

  container.find(".row").each((_: number, row: cheerio.Element) => {
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
            .map((_idx: number, div: cheerio.Element) => $(div).text().trim())
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

function extractLinks(
  $: cheerio.CheerioAPI,
  container: ReturnType<ReturnType<typeof cheerio.load>>,
  baseUrl: string,
): Link[] {
  const links: Link[] = [];

  container.find("a").each((_: number, a: cheerio.Element) => {
    const text = $(a).text().trim();
    const href = normalizeUrl($(a).attr("href") || "", baseUrl);
    if (href) links.push({ text, href });
  });

  return links;
}

function extractContent(
  $: cheerio.CheerioAPI,
  container: ReturnType<ReturnType<typeof cheerio.load>>,
): string {
  const clone = container.clone();
  clone.find("h2, script, style, img").remove();
  return clone
    .text()
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
}

function extractAllSections(
  html: string,
  wantedSections: string[],
  baseUrl: string,
): Section[] {
  const $ = cheerio.load(html);
  const wantedLowercase = wantedSections.map((s) => s.toLowerCase().trim());
  const sections: Section[] = [];

  $(".h2").each((_: number, h2El: cheerio.Element) => {
    const title = $(h2El).text().trim();
    if (!title || !wantedLowercase.includes(title.toLowerCase())) return;

    const container = $(h2El).closest(".card-body");
    if (container.length === 0) return;

    sections.push({
      title,
      fields: extractFields(
        $,
        container as ReturnType<ReturnType<typeof cheerio.load>>,
      ),
      content: extractContent(
        $,
        container as ReturnType<ReturnType<typeof cheerio.load>>,
      ),
      links: extractLinks(
        $,
        container as ReturnType<ReturnType<typeof cheerio.load>>,
        baseUrl,
      ),
    });
  });

  return sections;
}

function extractSearchResults(
  html: string,
  baseUrl: string,
): CompanySearchResult[] {
  const $ = cheerio.load(html);
  const results: CompanySearchResult[] = [];

  // Results are rendered as cards; each company has an a.h2.text-primary link
  $("a.h2.text-primary").each((_: number, a: cheerio.Element) => {
    const name = $(a).text().trim();
    const href = $(a).attr("href") || "";
    const url = normalizeUrl(href, baseUrl) || "";

    // Registry code is embedded in the URL: /company/XXXXXXXX/
    const codeMatch = href.match(/\/company\/(\d+)\//);
    let registryCode = codeMatch ? codeMatch[1] : "";
    let status = "";
    let address = "";

    // Pull label/value pairs from the containing card-body .row elements
    const cardBody = $(a).closest(".card-body");
    cardBody.find(".row").each((_: number, row: cheerio.Element) => {
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

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getOutputFolder(): string {
  const dataFolder = process.env.DATA_FOLDER || "./data";
  const folderPath = path.join(dataFolder, getTodayDate());
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-");
}

function saveJsonFile(filePath: string, data: unknown): void {
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

async function acceptCookiesIfPresent(page: Page) {
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

async function runSearch(
  page: Page,
  config: ReturnType<typeof getConfig>,
  query: string,
) {
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
 * Returns a list of matching results from the search results table.
 */
export async function getCompanyByNameOrNumber(
  query: string,
): Promise<CompanySearchResult[]> {
  const { browser, page, config } = await launchPage();

  try {
    await runSearch(page, config, query);

    try {
      await page.waitForSelector("a.h2.text-primary", {
        state: "attached",
        timeout: 5000,
      });
    } catch {
      // No results found
      return [];
    }

    const html = await page.content();
    return extractSearchResults(html, config.baseUrl);
  } finally {
    await browser.close();
  }
}

/**
 * Get the complete structured data for a company (all 12 sections).
 * Searches by name, clicks into the first matching result, and extracts all sections.
 */
export async function getCompleteInfo(
  companyName: string,
): Promise<CompanyFullData> {
  const { browser, page, config } = await launchPage();

  try {
    await runSearch(page, config, companyName);

    // Click the first company result link
    await page.waitForSelector("a.h2.text-primary", { timeout: 5000 });
    await page.click("a.h2.text-primary");
    await page.waitForLoadState("networkidle");

    const html = await page.content();
    const sections = extractAllSections(
      html,
      config.wantedSections,
      config.baseUrl,
    );

    const result: CompanyFullData = { name: companyName, sections };

    // Persist screenshot + JSON
    const folderPath = getOutputFolder();
    const safeName = sanitizeFilename(companyName);
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
