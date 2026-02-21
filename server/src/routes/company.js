const { Router } = require("express");
const { getCompanyByNameOrNumber, scrapeByUrl } = require("../scraper");

const router = Router();

// ============================================================================
// POST /getCompanyByNameOrNumber
// Body: { "jurisdiction_code": "ee", "company_name": "...", "company_number": "..." }
// ============================================================================
router.post("/getCompanyByNameOrNumber", async (req, res) => {
  const { jurisdiction_code, company_name, company_number } = req.body;

  const query = (company_name || company_number || "").trim();

  if (!query) {
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

    res.json(results);
  } catch (err) {
    console.error("[getCompanyByNameOrNumber] Error:", err);
    res.status(500).json({ error: "Failed to search company.", details: String(err) });
  }
});

// ============================================================================
// POST /getCompleteInfo
// Body: { "jurisdiction_code": "ee", "url": "https://ariregister.rik.ee/..." }
// ============================================================================
router.post("/getCompleteInfo", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string" || !url.trim()) {
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
    res.json(result);
  } catch (err) {
    console.error("[getCompleteInfo] Error:", err);
    res.status(500).json({ error: "Failed to retrieve company info.", details: String(err) });
  }
});

module.exports = router;
