import { Router } from "express";
import {
  getCompanyByNameOrNumber,
  getAutocompleteSuggestions,
  scrapeByUrl,
} from "../../scraper.js";

const router = Router();

// ============================================================================
// POST /getCompanyByNameOrNumber
// Body: { "jurisdiction_code": "ee", "company_name": "...", "company_number": "..." }
// ============================================================================
router.post("/getCompanyByNameOrNumber", async (req, res) => {
  const { jurisdiction_code, company_name, company_number } = req.body;
  console.log("[getCompanyByNameOrNumber] Request received", {
    jurisdiction_code,
    company_name,
    company_number,
  });

  const query = (company_name || company_number || "").trim();

  if (!query) {
    console.log(
      "[getCompanyByNameOrNumber] Validation failed: no query provided",
    );
    res.status(400).json({
      error: 'At least one of "company_name" or "company_number" is required.',
      example: { jurisdiction_code: "ee", company_name: "BOLT OPERATIONS OÜ" },
    });
    return;
  }

  const jCode = (jurisdiction_code || "ee").toLowerCase();

  try {
    const raw = await getCompanyByNameOrNumber(query);

    if (raw.length === 0) {
      console.log("[getCompanyByNameOrNumber] No results found", { query });
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

    console.log("[getCompanyByNameOrNumber] Success", {
      query,
      resultsCount: results.length,
    });
    res.json(results);
  } catch (err) {
    console.error("[getCompanyByNameOrNumber] Error:", err);
    res
      .status(500)
      .json({ error: "Failed to search company.", details: String(err) });
  }
});

// ============================================================================
// POST /getAutocompleteSuggestions
// Body: { "jurisdiction_code": "ee", "company_name": "abc" }
// ============================================================================
router.post("/getAutocompleteSuggestions", async (req, res) => {
  const { jurisdiction_code, company_name, company_number } = req.body;
  console.log("[getAutocompleteSuggestions] Request received", {
    jurisdiction_code,
    company_name,
    company_number,
  });

  const query = (company_name || company_number || "").trim();

  if (!query) {
    console.log(
      "[getAutocompleteSuggestions] Validation failed: no query provided",
    );
    res.status(400).json({
      error: 'At least one of "company_name" or "company_number" is required.',
      example: { jurisdiction_code: "ee", company_name: "abc" },
    });
    return;
  }

  const jCode = (jurisdiction_code || "ee").toLowerCase();

  try {
    const suggestions = await getAutocompleteSuggestions(query);

    if (suggestions.length === 0) {
      console.log("[getAutocompleteSuggestions] No suggestions found", {
        query,
      });
      res
        .status(404)
        .json({ error: "No autocomplete suggestions found.", query });
      return;
    }

    console.log("[getAutocompleteSuggestions] Success", {
      query,
      suggestionsCount: suggestions.length,
    });
    res.json({ jurisdiction_code: jCode, query, suggestions });
  } catch (err) {
    console.error("[getAutocompleteSuggestions] Error:", err);
    res
      .status(500)
      .json({ error: "Failed to get suggestions.", details: String(err) });
  }
});

// ============================================================================
// POST /getCompleteInfo
// Body: { "jurisdiction_code": "ee", "url": "https://ariregister.rik.ee/..." }
// ============================================================================
router.post("/getCompleteInfo", async (req, res) => {
  const { url } = req.body;
  console.log("[getCompleteInfo] Request received", { url });

  if (!url || typeof url !== "string" || !url.trim()) {
    console.log("[getCompleteInfo] Validation failed: invalid url");
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
    const result = await scrapeByUrl(url.trim());
    console.log("[getCompleteInfo] Success", { url });
    res.json(result);
  } catch (err) {
    console.error("[getCompleteInfo] Error:", err);
    res.status(500).json({
      error: "Failed to retrieve company info.",
      details: String(err),
    });
  }
});

export default router;
