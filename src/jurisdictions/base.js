/**
 * Base jurisdiction adapter.
 * Each jurisdiction extends this class and overrides the methods that differ.
 *
 * Responsibilities:
 *  - Provide URLs and browser selectors
 *  - Parse search-results HTML  → array of { name, registryCode, status, address, url }
 *  - Parse company-detail HTML  → structured company object
 */
export class BaseJurisdictionAdapter {
  /** @returns {string} */
  get baseUrl() { throw new Error("baseUrl not implemented"); }

  /** @returns {string} */
  get searchUrl() { throw new Error("searchUrl not implemented"); }

  /** Playwright selectors used during search */
  get selectors() {
    return {
      searchInput: "input[type='search']",
      searchButton: "button[type='submit']",
      autocompleteDropdown: null,
      autocompleteItem: null,
    };
  }

  /**
   * Parse the search-results page HTML.
   * @param {string} html
   * @returns {{ name: string, registryCode: string, status: string, address: string, url: string }[]}
   */
  // eslint-disable-next-line no-unused-vars
  extractSearchResults(html) {
    throw new Error("extractSearchResults not implemented");
  }

  /**
   * Parse a company detail page HTML into raw sections.
   * Used internally by extractCompanyResult.
   * @param {string} html
   * @returns {Array<{ title: string, fields: object, content: string, links: object[] }>}
   */
  // eslint-disable-next-line no-unused-vars
  extractCompanyDetail(html) {
    throw new Error("extractCompanyDetail not implemented");
  }

  /**
   * Given a live Playwright page and its HTML, extract the full structured
   * company result object. The page is provided for JS-rendered tables that
   * are not present in the static HTML snapshot.
   *
   * @param {import('playwright').Page} page
   * @param {string} html
   * @param {string} companyName  title already extracted by the caller
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line no-unused-vars
  async extractCompanyResult(page, html, companyName) {
    throw new Error("extractCompanyResult not implemented");
  }

  /**
   * CSS selector (or null) the scraper should wait for before extracting HTML.
   * Override per jurisdiction if the detail page uses a different container.
   * @returns {string}
   */
  get detailReadySelector() {
    return ".card-body";
  }

  /**
   * Extract autocomplete suggestions from the page.
   * Override if the registry supports it; base returns [].
   * @param {import('playwright').Page} _page
   * @returns {Promise<{ text: string }[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async extractAutocompleteSuggestions(_page) {
    return [];
  }
}
