import {chromium} from "playwright";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import JURISDICTION_ADAPTERS from "../config/jurisdictions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_JURISDICTION = "ee";

// ============================================================================
// ADAPTER RESOLUTION
// ============================================================================

function resolveAdapter(code) {
    const normalized = (code || DEFAULT_JURISDICTION).toLowerCase();
    return JURISDICTION_ADAPTERS[normalized] || JURISDICTION_ADAPTERS.ee;
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
        fs.mkdirSync(folderPath, {recursive: true});
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

const USER_AGENT = process.env.USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BROWSER_OPTIONS = {headless: process.env.BROWSER_HEADLESS !== "false"};

async function launchPage(adapter) {
    console.log("[launchPage] Launching browser", "jurisdiction", adapter.constructor.name, "searchUrl", adapter.searchUrl);
    const browser = await chromium.launch(BROWSER_OPTIONS);
    const page = await browser.newPage({userAgent: USER_AGENT});
    console.log("[launchPage] Browser and page launched successfully");
    return {browser, page};
}

async function acceptCookiesIfPresent(page) {
    try {
        const btn = page.locator("button#accept-cookies").first();
        if (await btn.isVisible({timeout: 2000})) {
            await btn.click();
            await page.waitForTimeout(800);
            console.log("[cookie] Accepted");
        }
    } catch {
        // No cookie banner present
    }
}

async function runSearch(page, adapter, query) {
    console.log("[runSearch] Navigating to search URL:", adapter.searchUrl);
    await page.goto(adapter.searchUrl, {waitUntil: "networkidle"});
    await acceptCookiesIfPresent(page);
    console.log("[runSearch] Waiting for search input selector:", adapter.selectors.searchInput);
    await page.waitForSelector(adapter.selectors.searchInput);
    console.log("[runSearch] Filling search query:", query);
    await page.fill(adapter.selectors.searchInput, query);
    console.log("[runSearch] Clicking search button:", adapter.selectors.searchButton);
    await page.click(adapter.selectors.searchButton);
    await page.waitForTimeout(1500);
    console.log("[runSearch] Search completed");
}

function safeSaveJson(filePath, data) {
    try {
        saveJsonFile(filePath, data);
    } catch (err) {
        console.error("[saveJsonFile] Failed to save JSON:", err);
        fs.writeFileSync(filePath, JSON.stringify({
            error: "Failed to serialize results",
            details: String(err),
        }, null, 2), "utf8");
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Search by company name or registry number.
 * Returns a list of matching results from the search results page.
 */
async function getCompanyByNameOrNumber(query, jurisdictionCode = DEFAULT_JURISDICTION) {
    const jCode = (jurisdictionCode || DEFAULT_JURISDICTION).toLowerCase();
    const adapter = resolveAdapter(jCode);

    console.log("[getCompanyByNameOrNumber] Starting search for:", query, "jurisdiction", jCode);
    const {browser, page} = await launchPage(adapter);

    try {
        await runSearch(page, adapter, query);
        console.log("[getCompanyByNameOrNumber] Search executed, waiting for results...", jCode);

        try {
            await Promise.any([
                page.waitForSelector("a.h2.text-primary", {state: "attached", timeout: 5000}),
                page.waitForSelector("table tbody tr", {state: "attached", timeout: 5000}),
            ]);
            console.log("[getCompanyByNameOrNumber] Results found on page");
        } catch {
            console.log("[getCompanyByNameOrNumber] No results found (timeout waiting for results)", jCode);
            return [];
        }

        const html = await page.content();
        const results = adapter.extractSearchResults(html);
        console.log("[getCompanyByNameOrNumber] Extracted", results.length, "results", jCode);

        if (results.length > 0) {
            const folderPath = getOutputFolder(jCode);
            const safeName = `search-${sanitizeFilename(query)}`;
            await page.screenshot({path: path.join(folderPath, `${safeName}.jpg`), fullPage: true});
            safeSaveJson(path.join(folderPath, `${safeName}.json`), results);
            console.log(`[saved] ${folderPath}/${safeName}.{jpg,json}`);
        }

        return results;
    } catch (err) {
        console.error("[getCompanyByNameOrNumber] Error:", err.message);
        throw err;
    } finally {
        await browser.close();
        console.log("[getCompanyByNameOrNumber] Browser closed for jurisdiction", jCode);
    }
}

/**
 * Navigate directly to a company detail URL and return the structured response.
 */
async function scrapeByUrl(url, jurisdictionCode = DEFAULT_JURISDICTION) {
    const jCode = (jurisdictionCode || DEFAULT_JURISDICTION).toLowerCase();
    const adapter = resolveAdapter(jCode);

    console.log("[scrapeByUrl] Starting scrape for URL:", url, "jurisdiction", jCode);
    const {browser, page} = await launchPage(adapter);

    try {
        console.log("[scrapeByUrl] Navigating to URL...");
        await page.goto(url, {waitUntil: "networkidle"});

        // Capture title before accepting cookies — accepting triggers a full page reload
        const pageTitle = await page.title();
        const companyName = pageTitle.split("|")[0].trim();
        console.log("[scrapeByUrl] Page title:", pageTitle, "-> Company name:", companyName);

        console.log("[scrapeByUrl] Accepting cookies if present...");
        await acceptCookiesIfPresent(page);
        console.log("[scrapeByUrl] Waiting for card-body selector...");
        await page.waitForSelector(".card-body", {timeout: 15000});
        await page.waitForLoadState("networkidle");
        console.log("[scrapeByUrl] Page loaded and ready");

        const html = await page.content();
        console.log("[scrapeByUrl] Extracting sections from HTML...");
        const sections = adapter.extractCompanyDetail(html);
        console.log("[scrapeByUrl] Extracted", sections.length, "sections");

        const general = sections.find((s) => s.title === "General information");
        const vat = sections.find((s) => s.title === "VAT information");

        // Officers — #representativesTable
        console.log("[scrapeByUrl] Extracting officers...");
        const officers = await page
            .$$eval("#representativesTable tbody tr", (rows) =>
                rows.map((row) => {
                    const cells = [...row.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? "");
                    return {name: cells[0], position: cells[2], entityType: null};
                }),
            )
            .catch(() => []);
        console.log("[scrapeByUrl] Extracted", officers.length, "officers");

        // Shareholders
        console.log("[scrapeByUrl] Extracting shareholders...");
        const shareholders = await page
            .$$eval("table", (tables) => {
                for (const table of tables) {
                    const headers = [...(table.querySelector("thead")?.querySelectorAll("th") ?? [])].map((th) => th.textContent?.trim());
                    if (headers[0] !== "Participation") continue;
                    return [...table.querySelectorAll("tbody tr")].map((row) => {
                        const cells = [...row.querySelectorAll("td")].map((td) => td.textContent?.trim().replace(/\s+/g, " ") ?? "");
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

        // Beneficial owners
        console.log("[scrapeByUrl] Extracting beneficial owners...");
        const ultimate_beneficial_owners = await page
            .$$eval("#beneficiaries-table tbody tr", (rows) =>
                rows.map((row) => {
                    const cells = [...row.querySelectorAll("td")].map((td) => td.textContent?.trim().replace(/\s+/g, " ") ?? "");
                    return {name: cells[0], position: null, entityType: null, type_of_control: cells[2]};
                }),
            )
            .catch(() => []);
        console.log("[scrapeByUrl] Extracted", ultimate_beneficial_owners.length, "beneficial owners");

        const fieldMap = {
            registryCode: process.env.FIELD_REGISTRY_CODE || "Registry code",
            vatNumber: process.env.FIELD_VAT_NUMBER || "VAT number",
            incorporated: process.env.FIELD_INCORPORATED || "Registered",
            legalForm: process.env.FIELD_LEGAL_FORM || "Legal form",
            status: process.env.FIELD_STATUS || "Status",
        };

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

        const folderPath = getOutputFolder(jCode);
        const safeName = sanitizeFilename(companyName || "company");
        console.log("[scrapeByUrl] Saving screenshot and JSON to:", folderPath);
        await page.screenshot({path: path.join(folderPath, `${safeName}.jpg`), fullPage: true});
        safeSaveJson(path.join(folderPath, `${safeName}.json`), result);
        console.log(`[saved] ${folderPath}/${safeName}.{jpg,json}`);

        return result;
    } catch (err) {
        console.error("[scrapeByUrl] Error:", err.message);
        throw err;
    } finally {
        await browser.close();
        console.log("[scrapeByUrl] Browser closed for jurisdiction", jCode);
    }
}

/**
 * Type a query into the search box and capture the autocomplete dropdown.
 */
async function getAutocompleteSuggestions(query, jurisdictionCode = DEFAULT_JURISDICTION) {
    const jCode = (jurisdictionCode || DEFAULT_JURISDICTION).toLowerCase();
    const adapter = resolveAdapter(jCode);

    console.log("[getAutocompleteSuggestions] Starting autocomplete for query:", query, "jurisdiction", jCode);
    const {browser, page} = await launchPage(adapter);

    try {
        console.log("[getAutocompleteSuggestions] Navigating to search URL...");
        await page.goto(adapter.searchUrl, {waitUntil: "networkidle"});
        await acceptCookiesIfPresent(page);
        console.log("[getAutocompleteSuggestions] Waiting for search input...");
        await page.waitForSelector(adapter.selectors.searchInput);

        console.log("[getAutocompleteSuggestions] Clicking search input and typing query...");
        await page.click(adapter.selectors.searchInput);
        await page.type(adapter.selectors.searchInput, query, {delay: 80});

        console.log("[getAutocompleteSuggestions] Waiting for autocomplete dropdown...");
        const suggestions = await adapter.extractAutocompleteSuggestions(page);
        console.log("[getAutocompleteSuggestions] Extracted", suggestions.length, "suggestions");

        const folderPath = getOutputFolder(jCode);
        const safeName = `autocomplete-${sanitizeFilename(query)}`;
        console.log("[getAutocompleteSuggestions] Saving screenshot and JSON to:", folderPath);
        await page.screenshot({path: path.join(folderPath, `${safeName}.jpg`), fullPage: false});
        safeSaveJson(path.join(folderPath, `${safeName}.json`), suggestions);
        console.log(`[saved] ${folderPath}/${safeName}.{jpg,json}`);

        return suggestions;
    } catch (err) {
        console.error("[getAutocompleteSuggestions] Error:", err.message);
        throw err;
    } finally {
        await browser.close();
        console.log("[getAutocompleteSuggestions] Browser closed for jurisdiction", jCode);
    }
}

export {getCompanyByNameOrNumber, getAutocompleteSuggestions, scrapeByUrl};
