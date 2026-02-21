import { Router, Request, Response } from 'express';
import { getCompanyByNameOrNumber, getCompleteInfo } from '../scraper';

const router = Router();

// ============================================================================
// POST /getCompanyByNameOrNumber
// Body: { "query": "BOLT OPERATIONS OÜ" } or { "query": "14532901" }
// Returns: array of matching companies from the search results table
// ============================================================================
router.post('/getCompanyByNameOrNumber', async (req: Request, res: Response) => {
  const { query } = req.body as { query?: string };

  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({
      error: 'Field "query" is required and must be a non-empty string.',
      example: { query: 'BOLT OPERATIONS OÜ' },
    });
    return;
  }

  try {
    const results = await getCompanyByNameOrNumber(query.trim());

    if (results.length === 0) {
      res.status(404).json({ error: 'No companies found for the given query.', query: query.trim() });
      return;
    }

    res.json({ query: query.trim(), total: results.length, results });
  } catch (err) {
    console.error('[getCompanyByNameOrNumber] Error:', err);
    res.status(500).json({ error: 'Failed to search company.', details: String(err) });
  }
});

// ============================================================================
// POST /getCompleteInfo
// Body: { "company": "BOLT OPERATIONS OÜ" }
// Returns: full structured data with all available sections
// ============================================================================
router.post('/getCompleteInfo', async (req: Request, res: Response) => {
  const { company } = req.body as { company?: string };

  if (!company || typeof company !== 'string' || !company.trim()) {
    res.status(400).json({
      error: 'Field "company" is required and must be a non-empty string.',
      example: { company: 'BOLT OPERATIONS OÜ' },
    });
    return;
  }

  try {
    const result = await getCompleteInfo(company.trim());
    res.json(result);
  } catch (err) {
    console.error('[getCompleteInfo] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve company info.', details: String(err) });
  }
});

export default router;
