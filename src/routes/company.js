import { Router } from "express";
import {
  handleAutocompleteSuggestions,
  handleCompanySearch,
  handleCompleteInfo,
} from "../controllers/companyController.js";

const router = Router();

// ============================================================================
// POST /getCompanyByNameOrNumber
// Body: { "jurisdiction_code": "ee", "company_name": "...", "company_number": "..." }
// ============================================================================
router.post("/getCompanyByNameOrNumber", handleCompanySearch);

// ============================================================================
// POST /getAutocompleteSuggestions
// Body: { "jurisdiction_code": "ee", "company_name": "abc" }
// ============================================================================
router.post("/getAutocompleteSuggestions", handleAutocompleteSuggestions);

// ============================================================================
// POST /getCompleteInfo
// Body: { "jurisdiction_code": "ee", "url": "https://ariregister.rik.ee/..." }
// ============================================================================
router.post("/getCompleteInfo", handleCompleteInfo);

export default router;
