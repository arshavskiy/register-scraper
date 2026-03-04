import * as cheerio from "cheerio";
import { BaseJurisdictionAdapter } from "./base.js";

function normalizeUrl(href, baseUrl) {
  if (!href || href === "#") return null;
  if (href.startsWith("/")) return baseUrl + href;
  return href;
}

export class EEAdapter extends BaseJurisdictionAdapter {
  get baseUrl() { return "https://ariregister.rik.ee"; }
  get searchUrl() { return "https://ariregister.rik.ee/eng"; }

  get selectors() {
    return {
      searchInput: "input#company_search",
      searchButton: 'button[type="submit"]',
      autocompleteDropdown: ".typeahead[role='listbox']",
      autocompleteItem: ".typeahead [role='option']",
    };
  }

  extractSearchResults(html) {
    const $ = cheerio.load(html);
    const results = [];

    // Primary layout: card-based results (exact match or small result sets)
    $("a.h2.text-primary").each((_, a) => {
      const name = $(a).text().trim();
      const href = $(a).attr("href") || "";
      const url = normalizeUrl(href, this.baseUrl) || "";

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

    if (results.length > 0) return results;

    // Fallback layout: table-based results (large result sets)
    $("table tbody tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 2) return;

      let name = "";
      let href = "";
      let url = "";
      let registryCode = "";
      let status = "";
      let address = "";

      cells.each((_, td) => {
        const anchor = $(td).find("a").first();
        if (anchor.length && !name) {
          name = anchor.text().trim();
          href = anchor.attr("href") || "";
          url = normalizeUrl(href, this.baseUrl) || "";
          const codeMatch = href.match(/\/company\/(\d+)\//);
          if (codeMatch) registryCode = codeMatch[1];
        }
        const text = $(td).text().replace(/\s+/g, " ").trim();
        if (/^\d{8}$/.test(text) && !registryCode) registryCode = text;
        if (/registered|active|deleted|liquidation/i.test(text) && !status) status = text;
      });

      if (!registryCode) {
        cells.each((_, td) => {
          const text = $(td).text().replace(/\s+/g, " ").trim();
          if (/^\d{7,10}$/.test(text)) { registryCode = text; return false; }
        });
      }

      if (name) results.push({ name, registryCode, status, address, url });
    });

    return results;
  }

  extractCompanyDetail(html) {
    const $ = cheerio.load(html);

    const wantedSections = [
      "General information", "VAT information", "Right of representation",
      "Contacts", "Shareholders", "Tax information",
      "Activity licenses and notices of economic activities",
      "Annual reports", "Areas of activity", "Articles of association",
      "Beneficial owners", "Data protection officer",
    ];
    const wantedLower = wantedSections.map((s) => s.toLowerCase());
    const sections = [];

    $(".h2").each((_, h2El) => {
      const title = $(h2El).text().trim();
      if (!title || !wantedLower.includes(title.toLowerCase())) return;

      const container = $(h2El).closest(".card-body");
      if (container.length === 0) return;

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
            const firstText = $(directDivs[0]).text().trim();
            if (firstText.length < 60) {
              label = firstText;
              value = directDivs.slice(1).map((_, div) => $(div).text().trim()).get().join("\n");
            }
          }
        }
        if (label && value) fields[label] = value;
      });

      // Content (plain text, no headings)
      const clone = container.clone();
      clone.find("h2, script, style, img").remove();
      const content = clone.text().replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim();

      // Links
      const links = [];
      container.find("a").each((_, a) => {
        const text = $(a).text().trim();
        const href = normalizeUrl($(a).attr("href") || "", this.baseUrl);
        if (href) links.push({ text, href });
      });

      sections.push({ title, fields, content, links });
    });

    return sections;
  }

  async extractAutocompleteSuggestions(page) {
    const { autocompleteDropdown, autocompleteItem } = this.selectors;
    try {
      await page.waitForSelector(autocompleteDropdown, { state: "visible", timeout: 4000 });
    } catch {
      return [];
    }
    return page
      .$$eval(autocompleteItem, (items) =>
        items
          .map((item) => {
            const text = (item.textContent ?? "").trim().replace(/\s+/g, " ");
            return text ? { text } : null;
          })
          .filter(Boolean),
      )
      .catch(() => []);
  }
}
