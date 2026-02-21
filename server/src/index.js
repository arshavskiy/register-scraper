require("dotenv").config();
const express = require("express");
const companyRoutes = require("./routes/company");

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(express.json());
app.use("/", companyRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Routes:`);
  console.log(`  POST http://localhost:${PORT}/getCompanyByNameOrNumber`);
  console.log(`  POST http://localhost:${PORT}/getCompleteInfo`);
  console.log(`  GET  http://localhost:${PORT}/health`);
});
