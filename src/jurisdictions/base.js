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
   * Parse a company detail page HTML.
   * @param {string} html
   * @returns {object}
   */
  // eslint-disable-next-line no-unused-vars
  extractCompanyDetail(html) {
    throw new Error("extractCompanyDetail not implemented");
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
