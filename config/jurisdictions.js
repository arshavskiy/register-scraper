import { EEAdapter } from "../src/jurisdictions/ee.js";
import { LVAdapter } from "../src/jurisdictions/lv.js";
import { LTAdapter } from "../src/jurisdictions/lt.js";
import { FIAdapter } from "../src/jurisdictions/fi.js";
import { SEAdapter } from "../src/jurisdictions/se.js";
import { DKAdapter } from "../src/jurisdictions/dk.js";
import { NOAdapter } from "../src/jurisdictions/no.js";
import { DEAdapter } from "../src/jurisdictions/de.js";
import { PLAdapter } from "../src/jurisdictions/pl.js";

/**
 * ISO 3166-1 alpha-2 keyed jurisdiction adapters.
 * Each adapter provides URLs, selectors, and HTML parsing logic
 * specific to that country's business registry.
 */
const JURISDICTION_ADAPTERS = {
  ee: new EEAdapter(),
  lv: new LVAdapter(),
  lt: new LTAdapter(),
  fi: new FIAdapter(),
  se: new SEAdapter(),
  dk: new DKAdapter(),
  no: new NOAdapter(),
  de: new DEAdapter(),
  pl: new PLAdapter(),
};

export default JURISDICTION_ADAPTERS;
