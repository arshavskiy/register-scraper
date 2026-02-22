// ISO 3166-1 alpha-2 keyed endpoints for supported jurisdictions.
const JURISDICTION_ENDPOINTS = {
  ee: {
    baseUrl: "https://ariregister.rik.ee",
    searchUrl: "https://ariregister.rik.ee/eng",
  },
  lv: {
    baseUrl: "https://www.ur.gov.lv",
    searchUrl: "https://www.ur.gov.lv/lv/search",
  },
  lt: {
    baseUrl: "https://www.registrucentras.lt",
    searchUrl: "https://www.registrucentras.lt/jar/paieska",
  },
  fi: {
    baseUrl: "https://www.ytj.fi",
    searchUrl: "https://www.ytj.fi/en/yrityshaku",
  },
  se: {
    baseUrl: "https://www.bolagsverket.se",
    searchUrl:
      "https://www.bolagsverket.se/en/foretagsinformation/foretagsregister",
  },
  dk: {
    baseUrl: "https://datacvr.virk.dk",
    searchUrl: "https://datacvr.virk.dk/data/visenhed",
  },
  no: {
    baseUrl: "https://www.brreg.no",
    searchUrl: "https://w2.brreg.no/enhet/sok",
  },
  de: {
    baseUrl: "https://www.handelsregister.de",
    searchUrl: "https://www.handelsregister.de/rp_web/mask.do?Typ=e",
  },
  pl: {
    baseUrl: "https://ekrs.ms.gov.pl",
    searchUrl: "https://ekrs.ms.gov.pl/rdf/podmioty",
  },
};

export default JURISDICTION_ENDPOINTS;
