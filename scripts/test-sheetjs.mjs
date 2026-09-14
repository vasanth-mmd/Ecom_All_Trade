import * as XLSX from "xlsx";

console.log("Creating 50,000 sample rows...");
const sample = [];
for (let i = 0; i < 50000; i++) {
  sample.push({
    "PO Number": "PO" + i,
    "Po Date": "2026-09-05",
    "Month": "September",
    "Po Expiry Date": "2026-09-07",
    "City": "Bengaluru",
    "Item Code": "12345",
    "SKU Name": "Test SKU Name " + (i % 100),
    "Category": "Yogurt",
    "PO Qty": 100,
    "Po Value": 0.5,
    "PO Status": "Fully Supplied Po",
    "GRN Qty": 100,
    "GRN Value": 0.5,
    "Trade": "Swiggy",
    "Region": "South",
    "MMD Item Code": "MMD" + i,
    "MMD SKU name": "MMD SKU " + i,
  });
}

console.log("Testing json_to_sheet and XLSX.write...");
try {
  console.time("json_to_sheet");
  const ws = XLSX.utils.json_to_sheet(sample);
  console.timeEnd("json_to_sheet");

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Raw Data");

  console.time("XLSX.write");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  console.timeEnd("XLSX.write");
  console.log("Generated buffer size:", buf.length);
} catch (e) {
  console.error("CAUGHT ERROR:", e);
}
