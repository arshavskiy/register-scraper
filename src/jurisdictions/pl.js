import { BaseJurisdictionAdapter } from "./base.js";

const API_BASE = "https://wyszukiwarka-krs-api.ms.gov.pl";
const SEARCH_URL = "https://wyszukiwarka-krs.ms.gov.pl/";

export class PLAdapter extends BaseJurisdictionAdapter {
  get baseUrl()   { return "https://wyszukiwarka-krs.ms.gov.pl"; }
  get searchUrl() { return SEARCH_URL; }

  get selectors() {
    return {
      // Angular SPA — input found by label text, not name attribute
      searchInput: "ds-input input",
      searchButton: "button[type='submit']",
      autocompleteDropdown: null,
      autocompleteItem: null,
    };
  }

  get detailReadySelector() {
    // Not used — PL uses the JSON API, not HTML detail pages
    return "body";
  }

  /**
   * Instead of parsing HTML, call the KRS search API directly.
   * The `html` parameter is ignored — we call the API from within
   * the live Playwright page context (so cookies/headers are inherited).
   *
   * This method is called by the scraper after runSearch, which has already
   * navigated to the search page. We intercept by overriding runSearchAndExtract.
   */
  extractSearchResults(_html) {
    // Not used for PL — search results come from the API via extractSearchResultsFromPage
    return [];
  }

  /**
   * Perform the full search via the KRS JSON API using Playwright's page.evaluate
   * so the request shares the browser session (CORS, cookies).
   *
   * @param {import('playwright').Page} page  - already on the search URL
   * @param {string} query
   * @returns {Promise<{ name, registryCode, status, address, url }[]>}
   */
  async searchViaApi(page, query) {
    const body = {
      rejestr: ["P", "S"],
      podmiot: {
        krs: null, nip: null, regon: null,
        nazwa: query,
        wojewodztwo: null, powiat: null, gmina: null, miejscowosc: null,
        dokladnaNazwa: false,
      },
      status: {
        czyOpp: null,
        czyWpisDotyczacyPostepowaniaUpadlosciowego: null,
        dataPrzyznaniaStatutuOppOd: null,
        dataPrzyznaniaStatutuOppDo: null,
      },
      paginacja: {
        liczbaElementowNaStronie: 100,
        maksymalnaLiczbaWynikow: 100,
        numerStrony: 1,
      },
    };

    const data = await page.evaluate(async ({ apiBase, payload }) => {
      const resp = await fetch(`${apiBase}/api/wyszukiwarka/krs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      return resp.json();
    }, { apiBase: API_BASE, payload: body });

    return (data.listaPodmiotow || []).map((item) => {
      const krs = String(item.numer).padStart(10, "0");
      return {
        name:         item.nazwa,
        registryCode: krs,
        status:       item.czyUpadlosc ? "Postępowanie upadłościowe" : "Aktywny",
        address:      item.miejscowosc || "",
        url:          `${this.baseUrl}/?numerkrs=${krs}`,
      };
    });
  }

  extractCompanyDetail(_html) {
    // PL detail data comes from the KRS API, not HTML parsing
    return [];
  }

  async extractCompanyResult(page, _html, companyName) {
    // Extract the KRS number from the current URL
    const url = page.url();
    const krsMatch = url.match(/numerkrs=(\d+)/i);
    if (!krsMatch) {
      return { company_name: companyName, error: "Could not extract KRS number from URL" };
    }
    const krs = krsMatch[1].padStart(10, "0");

    // Fetch full company data from the official KRS API
    const [dataP, dataS] = await Promise.allSettled([
      page.evaluate(async ({ krs }) => {
        const r = await fetch(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${krs}?rejestr=P&format=json`);
        return r.ok ? r.json() : null;
      }, { krs }),
      page.evaluate(async ({ krs }) => {
        const r = await fetch(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${krs}?rejestr=S&format=json`);
        return r.ok ? r.json() : null;
      }, { krs }),
    ]);

    const data = dataP.value || dataS.value;
    if (!data) {
      return { company_name: companyName, company_number: krs, error: "Could not fetch KRS detail" };
    }

    const odpis = data.odpis;
    const dane = odpis?.dane?.dzialy?.dzial1?.danePodmiotu;
    const siedz = odpis?.dane?.dzialy?.dzial1?.siedzibaIAdresPodmiotu;
    const repr = odpis?.dane?.dzialy?.dzial2?.reprezentacja;
    const wsplnicy = odpis?.dane?.dzialy?.dzial1?.wspolnicy;

    const officers = (repr?.sposobReprezentacji || []).flatMap(s =>
      (s.osobyFizyczne || []).map(o => ({
        name: [o.imiona, o.nazwisko].filter(Boolean).join(" "),
        position: s.nazwaFunkcji || null,
        entityType: null,
      }))
    );

    const shareholders = (wsplnicy?.wspolnik || []).map(w => ({
      name: w.firma || [w.imiona, w.nazwisko].filter(Boolean).join(" "),
      shares: w.udzialWKapitale ? `${w.udzialWKapitale}%` : "",
      shareCount: w.liczbaUdzialow || null,
      entityType: w.firma ? "company" : "individual",
      type_of_control: "",
    }));

    return {
      company_name:        dane?.nazwa || companyName,
      company_number:      krs,
      jurisdiction_ident:  dane?.nip || "",
      incorporation_date:  odpis?.naglowekA?.dataPowstania || "",
      dissolution_date:    odpis?.naglowekA?.dataRozwiazania || "",
      company_type:        dane?.formaPrawna || "",
      current_status:      odpis?.naglowekA?.stanRejestrowy || "",
      more_info_available: true,
      ultimate_beneficial_owners: [],
      officers,
      shareholders,
    };
  }
}
