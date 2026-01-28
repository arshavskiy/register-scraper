import {chromium} from 'playwright';
import fs from 'fs';
import * as cheerio from 'cheerio';
import {performance} from 'perf_hooks';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    baseUrl: process.env.BASE_URL || 'https://ariregister.rik.ee',
    searchUrl: process.env.SEARCH_URL || 'https://ariregister.rik.ee/eng',
    dataFolder: process.env.DATA_FOLDER || './data',
    browserOptions: {headless: process.env.BROWSER_HEADLESS !== 'false'},
    selectors: {
        searchInput: process.env.SELECTOR_SEARCH_INPUT || 'input#company_search',
        searchButton: process.env.SELECTOR_SEARCH_BUTTON || 'button[type="submit"]',
        resultRow: process.env.SELECTOR_RESULT_ROW || 'table tbody tr',
    },
    userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    wantedSections: process.env.WANTED_SECTIONS.split(" ") || [
        'General information',
        'VAT information',
        'Right of representation',
        'Contacts',
        'Shareholders',
        'Tax information',
        'Activity licenses and notices of economic activities',
        'Annual reports',
        'Areas of activity',
        'Articles of association',
        'Beneficial owners',
        'Data protection officer',
    ],
};

// ============================================================================
// FILE SYSTEM UTILITIES
// ============================================================================

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function createFolderIfNotExists(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, {recursive: true});
    }
}

function saveJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getOutputFolder() {
    const today = getTodayDate();
    const folderPath = `${CONFIG.dataFolder}/${today}`;
    createFolderIfNotExists(folderPath);
    return folderPath;
}

// ============================================================================
// BROWSER NAVIGATION
// ============================================================================

async function navigateToSearchPage(page) {
    await page.goto(CONFIG.searchUrl, {waitUntil: 'networkidle'});
}

async function searchForCompany(page, companyName) {
    await page.waitForSelector(CONFIG.selectors.searchInput);
    await page.fill(CONFIG.selectors.searchInput, companyName);
    await page.click(CONFIG.selectors.searchButton);
    await page.waitForTimeout(1000);
}

async function openCompanyPage(page, companyName) {
    const companyLink = `a:has-text("${companyName}")`;
    await page.click(companyLink);
    await page.waitForLoadState('networkidle');
}

async function waitForResults(page) {
    try {
        await page.waitForSelector(CONFIG.selectors.resultRow, {
            state: 'attached',
            timeout: 2000,
        });
    } catch (e) {
        console.log('Warning: Results table not found, continuing anyway...');
    }
}

async function takeScreenshot(page, folderPath, companyName) {
    await page.screenshot({
        path: `${folderPath}/${companyName}.jpg`,
        fullPage: true,
    });
}

// ============================================================================
// HTML EXTRACTION UTILITIES
// ============================================================================

function normalizeUrl(href) {
    if (!href || href === '#') return null;
    if (href.startsWith('/')) {
        return CONFIG.baseUrl + href;
    }
    return href;
}

function extractFields($, container) {
    const fields = {};
    
    container.find('.row').each((i, row) => {
        const $row = $(row);
        let label = $row.find('.text-muted, .col-md-4, .col-4').first().text().trim();
        let value = $row.find('.font-weight-bold, .col:not(.col-md-4):not(.text-muted)').first().text().trim();
        
        // Fallback: try direct children divs
        if (!label) {
            const directDivs = $row.children('div');
            if (directDivs.length >= 2) {
                const firstDivText = $(directDivs[0]).text().trim();
                if (firstDivText.length < 60) {
                    label = firstDivText;
                    value = directDivs
                        .slice(1)
                        .map((idx, div) => $(div).text().trim())
                        .get()
                        .join('\n');
                }
            }
        }
        
        if (label && value) {
            fields[label] = value;
        }
    });
    
    return fields;
}

function extractLinks($, container) {
    const links = [];
    
    container.find('a').each((i, a) => {
        const text = $(a).text().trim();
        const href = normalizeUrl($(a).attr('href') || '');
        
        if (href) {
            links.push({text, href});
        }
    });
    
    return links;
}

function extractContent($, container) {
    const containerClone = container.clone();
    containerClone.find('h2').remove();
    containerClone.find('script, style, img').remove();
    return containerClone
        .text()
        .replace(/\s+/g, ' ')
        .replace(/\u00A0/g, ' ')
        .trim();
}

function extractSection($, h2Element, wantedLowercase) {
    const title = $(h2Element).text().trim();
    if (!title || !wantedLowercase.includes(title.toLowerCase())) {
        return null;
    }
    
    const container = $(h2Element).closest('.card-body');
    if (container.length === 0) return null;
    
    return {
        title,
        fields: extractFields($, container),
        content: extractContent($, container),
        links: extractLinks($, container),
    };
}

function extractAllSections(html, wantedSections) {
    const $ = cheerio.load(html);
    const wantedLowercase = wantedSections.map((s) => s.toLowerCase().trim());
    const h2s = $('.h2').toArray();
    
    const sections = [];
    h2s.forEach((h2Element) => {
        const section = extractSection($, h2Element, wantedLowercase);
        if (section) {
            sections.push(section);
        }
    });
    
    return sections;
}

// ============================================================================
// REPORTING UTILITIES
// ============================================================================

function findFoundTitles(html, wantedSections) {
    const $ = cheerio.load(html);
    const wantedLowercase = wantedSections.map((s) => s.toLowerCase().trim());
    const foundTitles = new Set();
    
    $('.h2').each((i, h2Element) => {
        const title = $(h2Element).text().trim();
        if (title && wantedLowercase.includes(title.toLowerCase())) {
            foundTitles.add(title.toLowerCase());
        }
    });
    
    return foundTitles;
}

function printExtractionStatus(foundTitles, wantedSections) {
    console.log('\n📋 Section extraction status:');
    
    wantedSections.forEach((title) => {
        const found = foundTitles.has(title.toLowerCase());
        const checkbox = found ? '☑' : '☐';
        console.log(`${checkbox} ${title}`);
    });
    
    console.log(`\nFound: ${foundTitles.size}/${wantedSections.length} sections\n`);
}

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

async function searchCompany(companyName) {
    const browser = await chromium.launch(CONFIG.browserOptions);
    const page = await browser.newPage({
        userAgent: CONFIG.userAgent,
    });
    
    try {
        // Navigate and search
        await navigateToSearchPage(page);
        await searchForCompany(page, companyName);
        await openCompanyPage(page, companyName);
        await waitForResults(page);
        
        // Prepare output folder
        const folderPath = getOutputFolder();
        await takeScreenshot(page, folderPath, companyName);
        
        // Extract data
        const html = await page.content();
        const sections = extractAllSections(html, CONFIG.wantedSections);
        
        // Report status
        const foundTitles = findFoundTitles(html, CONFIG.wantedSections);
        printExtractionStatus(foundTitles, CONFIG.wantedSections);
        
        // Prepare and save results
        const results = [{name: companyName}, ...sections];
        const jsonPath = `${folderPath}/${companyName}.json`;
        saveJsonFile(jsonPath, results);
        
        return results;
    } finally {
        await browser.close();
    }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================
(async () => {
    // Get company name from command-line arguments
    const company = process.argv[2];
    
    if (!company) {
        console.error('Error: Company name is required!');
        console.log('Usage: node searchCompany.js "COMPANY NAME"');
        console.log('Example: node searchCompany.js "BOLT OPERATIONS OÜ"');
        process.exit(1);
    }
    
    console.log(`Searching for: ${company}`);
    
    const startTime = performance.now();
    await searchCompany(company);
    const endTime = performance.now();
    console.log(`Execution time: ${(endTime - startTime).toFixed(2)}ms (${((endTime - startTime) / 1000).toFixed(2)}s)`);
    
})();
