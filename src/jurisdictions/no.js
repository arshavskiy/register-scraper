import * as cheerio from "cheerio";
import { BaseJurisdictionAdapter } from "./base.js";

function normalizeUrl(href, baseUrl) {
  if (!href || href === "#") return null;
  if (href.startsWith("/")) return baseUrl + href;
  return href;
}

export class NOAdapter extends BaseJurisdictionAdapter {
  get baseUrl() { return "https://www.brreg.no"; }
  get searchUrl() { return "https://w2.brreg.no/enhet/sok"; }

  get selectors() {
    return {
      searchInput: "input[name='orgnavn']",
      searchButton: "input[type='submit']",
      autocompleteDropdown: null,
      autocompleteItem: null,
    };
  }

  extractSearchResults(html) {
    const $ = cheerio.load(html);
    const results = [];

    // TODO: map to actual NO registry HTML structure
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
        }
        const text = $(td).text().replace(/\s+/g, " ").trim();
        // NO org numbers: 9 digits
        if (/^\d{9}$/.test(text) && !registryCode) registryCode = text;
      });

      if (name) results.push({ name, registryCode, status, address, url });
    });

    return results;
  }

  extractCompanyDetail(_html) {
    // TODO: implement NO company detail extraction
    return [];
  }
}
