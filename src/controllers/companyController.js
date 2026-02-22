import {
  getAutocompleteSuggestions,
  getCompanyByNameOrNumber,
  scrapeByUrl,
} from "../scraper.js";

const DEFAULT_JURISDICTION = "ee";

function normalizeJurisdiction(rawCode) {
  return (rawCode || DEFAULT_JURISDICTION).toLowerCase();
}

export async function handleCompanySearch(req, res) {
  const { jurisdiction_code, company_name, company_number } = req.body;
  const query = (company_name || company_number || "").trim();
  const jCode = normalizeJurisdiction(jurisdiction_code);
  const jurisdictionLog = { jurisdiction_code: jCode };

  console.log("[companyController] getCompanyByNameOrNumber request", {
    ...jurisdictionLog,
    company_name,
    company_number,
  });

  if (!query) {
    console.log("[companyController] Validation failed: no query provided");
    res.status(400).json({
      error: 'At least one of "company_name" or "company_number" is required.',
      example: { jurisdiction_code: "ee", company_name: "BOLT OPERATIONS OÜ" },
    });
    return;
  }

  try {
    const raw = await getCompanyByNameOrNumber(query, jCode);

    if (raw.length === 0) {
      console.log("[companyController] No results found", {
        query,
        ...jurisdictionLog,
      });
      res.status(404).json({ error: "No companies found.", query });
      return;
    }

    const results = raw.map((r) => ({
      jurisdiction_code: jCode,
      company_name: r.name,
      company_number: r.registryCode,
      address: r.address,
      status: r.status,
      url: r.url,
    }));

    console.log("[companyController] Success", {
      query,
      resultsCount: results.length,
    });
    res.json(results);
  } catch (err) {
    console.error("[companyController] getCompanyByNameOrNumber Error:", err);
    res
      .status(500)
      .json({ error: "Failed to search company.", details: String(err) });
  }
}

export async function handleAutocompleteSuggestions(req, res) {
  const { jurisdiction_code, company_name, company_number } = req.body;
  const query = (company_name || company_number || "").trim();
  const jCode = normalizeJurisdiction(jurisdiction_code);
  const jurisdictionLog = { jurisdiction_code: jCode };

  console.log("[companyController] getAutocompleteSuggestions request", {
    ...jurisdictionLog,
    company_name,
    company_number,
  });

  if (!query) {
    console.log("[companyController] Validation failed: no query provided");
    res.status(400).json({
      error: 'At least one of "company_name" or "company_number" is required.',
      example: { jurisdiction_code: "ee", company_name: "abc" },
    });
    return;
  }

  try {
    const suggestions = await getAutocompleteSuggestions(query, jCode);

    if (suggestions.length === 0) {
      console.log("[companyController] No suggestions found", {
        query,
        ...jurisdictionLog,
      });
      res
        .status(404)
        .json({ error: "No autocomplete suggestions found.", query });
      return;
    }

    console.log("[companyController] Success", {
      query,
      suggestionsCount: suggestions.length,
    });
    res.json({ jurisdiction_code: jCode, query, suggestions });
  } catch (err) {
    console.error("[companyController] getAutocompleteSuggestions Error:", err);
    res
      .status(500)
      .json({ error: "Failed to get suggestions.", details: String(err) });
  }
}

export async function handleCompleteInfo(req, res) {
  const { jurisdiction_code, url } = req.body;
  const jCode = normalizeJurisdiction(jurisdiction_code);
  const jurisdictionLog = { jurisdiction_code: jCode };

  console.log("[companyController] getCompleteInfo request", {
    ...jurisdictionLog,
    url,
  });

  if (!url || typeof url !== "string" || !url.trim()) {
    console.log("[companyController] Validation failed: invalid url");
    res.status(400).json({
      error: '"url" is required and must be a non-empty string.',
      example: {
        jurisdiction_code: "ee",
        url: "https://ariregister.rik.ee/eng/company/14532901/Bolt-Operations-O%C3%9C",
      },
    });
    return;
  }

  try {
    const result = await scrapeByUrl(url.trim(), jCode);
    console.log("[companyController] Success", { url });
    res.json(result);
  } catch (err) {
    console.error("[companyController] getCompleteInfo Error:", err);
    res.status(500).json({
      error: "Failed to retrieve company info.",
      details: String(err),
    });
  }
}
