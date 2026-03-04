import fetch from "node-fetch";
const PORT = parseInt(process.env.PORT || "3334", 10);
const BASE_URL = `http://localhost:${PORT}`;

async function testAutocompleteSuggestions() {
  const response = await fetch(`${BASE_URL}/getAutocompleteSuggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jurisdiction_code: "ee", company_name: "abc" }),
  });
  const data = await response.json();
  console.log("/getAutocompleteSuggestions:", response.status, data);
}

(async () => {
  await testAutocompleteSuggestions();

  // Test /getCompanyByNameOrNumber
  const response = await fetch(`${BASE_URL}/getCompanyByNameOrNumber`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jurisdiction_code: "ee",
      company_name: "Bolt Operations OÜ",
    }),
  });
  const data = await response.json();
  console.log("/getCompanyByNameOrNumber:", response.status, data);

  // Test broad query (many results — table layout)
  const broadRes = await fetch(`${BASE_URL}/getCompanyByNameOrNumber`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jurisdiction_code: "ee", company_name: "OPERATIONS" }),
  });
  const broadData = await broadRes.json();
  console.log("/getCompanyByNameOrNumber (broad):", broadRes.status, `count=${broadData.count}`, broadData.results?.slice(0, 3));

  // Test /getCompleteInfo (using a known company URL)
  if (data.results && data.results.length > 0 && data.results[0].url) {
    const detailRes = await fetch(`${BASE_URL}/getCompleteInfo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jurisdiction_code: "ee", url: data.results[0].url }),
    });
    const detailData = await detailRes.json();
    console.log("/getCompleteInfo:", detailRes.status, detailData);
  } else {
    console.log(
      "/getCompleteInfo: Skipped (no company URL found in previous test)",
    );
  }
})();
