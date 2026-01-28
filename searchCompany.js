import { chromium } from 'playwright';
import fs from 'fs';
import * as cheerio from 'cheerio';
import { performance } from 'perf_hooks';

async function searchCompany(companyName) {
    const browser = await chromium.launch({headless: true});
    const page = await browser.newPage();
    
    await page.goto("https://ariregister.rik.ee/eng", {
        waitUntil: "networkidle",
    });
    
    const searchInput = "input#company_search";
    await page.waitForSelector(searchInput);
    
    await page.fill(searchInput, companyName);
    
    const searchBtn = 'button[type="submit"]';
    await page.click(searchBtn)
    
    await page.waitForTimeout(1000);
    
    const companyLink = `a:has-text("${companyName}")`;
    await page.click(companyLink);
    await page.waitForLoadState("networkidle");
    
    const resultRow = "table tbody tr";
    
    try {
        await page.waitForSelector(resultRow, {state: "attached", timeout: 1000});
    } catch (e) {
        console.log(
            "Selector 'table tbody tr' not found, taking screenshot for debug",
        );
        
        throw e;
    }
    
    const today = new Date().toISOString().split("T")[0];
    const folderPath = `./data/${today}`;
    
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, {recursive: true});
    }
    
    await page.screenshot({
        path: `${folderPath}/${companyName}.jpg`,
        fullPage: true,
    });
    
    
    // Run extractor using cheerio (Node-side, debuggable in IntelliJ)
    const html = await page.content();
    const $ = cheerio.load(html);
    
    const wanted = [
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
    ].map(s => s.toLowerCase().trim());
    
    const results = [];
    results.push({ "name" : companyName });
    
    // Find all H2 elements in the page
    const h2s = $('.h2').toArray();
    
    // Track which wanted titles are found
    const foundTitles = new Set();
    
    h2s.forEach((h2Element) => {
        const title = $(h2Element).text().trim();
        if (title && wanted.includes(title.toLowerCase())) {
            foundTitles.add(title.toLowerCase());
        }
    });
    
    // Print checkbox list of wanted titles
    console.log(' Section extraction status:');
    const wantedOriginal = [
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
    
    wantedOriginal.forEach(title => {
        const found = foundTitles.has(title.toLowerCase());
        const checkbox = found ? '☑' : '☐';
        console.log(`${checkbox} ${title}`);
    });
    console.log(`\nFound: ${foundTitles.size}/${wantedOriginal.length} sections\n`);
    
    h2s.forEach((h2Element) => {
        const title = $(h2Element).text().trim();
        if (!title) return;
        if (!wanted.includes(title.toLowerCase())) return;
        
        // Parent container - prefer .card-body as in the page structure
        const container = $(h2Element).closest('.card-body');
        if (container.length === 0) return;
        
        // Collect label/value pairs from rows inside the container
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
                        value = directDivs.slice(1).map((idx, div) => $(div).text().trim()).get().join('\n');
                    }
                }
            }
            
            if (label && value) {
                fields[label] = value;
            }
        });
        
        // Collect links inside the container (exclude "#" links)
        const links = [];
        container.find('a').each((i, a) => {
            const text = $(a).text().trim();
            let href = $(a).attr('href') || '';
            // Only save links that are not "#" (empty/anchor links)
            if (href && href !== '#') {
                // Add base URL if link starts with "/"
                if (href.startsWith('/')) {
                    href = 'https://ariregister.rik.ee' + href;
                }
                links.push({ text, href });
            }
        });
        
        // Build content text by cloning container and removing the H2 and noisy elements
        const containerClone = container.clone();
        containerClone.find('h2').remove();
        containerClone.find('script, style, img').remove();
        const contentText = containerClone.text().replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim();
        
        results.push({ title, fields, content: contentText, links });
    });
    
    const jsonPath = `${folderPath}/${companyName}.json`;
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf8");
    
    await browser.close();
    
    return results;
}

// ---- run ----
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
