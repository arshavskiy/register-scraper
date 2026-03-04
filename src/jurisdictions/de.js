import * as cheerio from "cheerio";
import { BaseJurisdictionAdapter } from "./base.js";

function normalizeUrl(href, baseUrl) {
  if (!href || href === "#") return null;
  if (href.startsWith("/")) return baseUrl + href;
  return href;
}

export class DEAdapter extends BaseJurisdictionAdapter {
  get baseUrl() { return "https://www.handelsregister.de"; }
  get searchUrl() { return "https://www.handelsregister.de/rp_web/mask.do?Typ=e"; }

  get selectors() {
    return {
      searchInput: "input[name='schlagwoerter']",
      searchButton: "input[type='submit']",
      autocompleteDropdown: null,
      autocompleteItem: null,
    };
  }

  extractSearchResults(html) {
    const $ = cheerio.load(html);
    const results = [];

    // TODO: map to actual DE registry HTML structure
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
        // DE register numbers vary by court (e.g. HRB 12345)
        if (/^HR[BA]\s+\d+/.test(text) && !registryCode) registryCode = text;
      });

      if (name) results.push({ name, registryCode, status, address, url });
    });

    return results;
  }

  extractCompanyDetail(_html) {
    // TODO: implement DE company detail extraction
    return [];
  }
}
