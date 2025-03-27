require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// 🔐 FileMaker Config
const FM_HOST = process.env.FM_HOST;
const FM_DATABASE = process.env.FM_DATABASE;
const FM_USER = process.env.FM_USER;
const FM_PASS = process.env.FM_PASS;
const FM_LAYOUT = process.env.FM_LAYOUT;

// 🔐 Construct FileMaker Base URL
const FILEMAKER_BASE_URL = `${FM_HOST}/fmi/data/v1/databases/${FM_DATABASE}`;
console.log("🧪 FILEMAKER_BASE_URL:", FILEMAKER_BASE_URL);

const now = new Date();
const dateApproved = now.toISOString().split("T")[0]; // "2025-03-27"
const timeStampApproved = now.toISOString(); // Full ISO timestamp

// 🔐 Basic auth header
const basicAuth = Buffer.from(`${FM_USER}:${FM_PASS}`).toString("base64");

// 🧠 Utility: Append to log file
function logEvent(message) {
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp} - ${message}\n`;
  fs.appendFile(path.join(__dirname, "webhook.log"), logLine, (err) => {
    if (err) console.error("❌ Failed to write to log:", err);
  });
}

// 🧠 Utility: Save failed requests for future retry
function saveFailedPayload(payload, reason) {
  const failure = {
    timestamp: new Date().toISOString(),
    payload,
    reason
  };
  fs.appendFile(
    path.join(__dirname, "failed_webhooks.json"),
    JSON.stringify(failure) + ",\n",
    (err) => {
      if (err) console.error("❌ Failed to save failed webhook:", err);
    }
  );
}

// 🔑 Get FileMaker token
async function getToken() {
  const response = await axios.post(
    `${FM_HOST}/fmi/data/v1/databases/${FM_DATABASE}/sessions`,
    {},
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.response.token;
}

// 🔎 Webhook: Find and update record
app.post("/webhook", async (req, res) => {
  try {
    let { order_number } = req.body;

    if (!order_number) {
      logEvent("⚠️ Missing order_number in body");
      return res.status(400).json({ error: "Missing order_number in body" });
    }

    console.log(`📦 Incoming order number: ${order_number}`);

    if (order_number.startsWith("SS")) {
      order_number = order_number.slice(2);
      console.log(`🔍 Stripped order number: ${order_number}`);
    }

    const token = await getToken();

    const findResponse = await axios.post(
      `${FILEMAKER_BASE_URL}/layouts/${FM_LAYOUT}/_find`,
      {
        query: [{ Shopify_OrderNumber: order_number }]
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const record = findResponse.data.response.data[0];
    const recordId = record.recordId;

    console.log(`✅ Match found: Record ID ${recordId} for order ${order_number}`);
    logEvent(`✅ Updated order ${order_number} (Record ID: ${recordId})`);

// 🔄 Update record with multiple fields
await axios.patch(
  `${FILEMAKER_BASE_URL}/layouts/${FM_LAYOUT}/records/${recordId}`,
  {
    fieldData: {
      FOUND: "YES",
      "Date_Approved": dateApproved,
      "TimeStamp_Approved": timeStampApproved,
      "Status": "Approved"
    }
  },
  {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  }
);

    console.log(`📝 Updated record ${recordId} with FOUND = "YES"`);
    res.json({ success: true, recordId });

  } catch (error) {
    const order_number = req.body?.order_number || "UNKNOWN";
    const errMsg = error.response?.data || error.message || error;

    console.error("❌ Webhook error:", errMsg);
    logEvent(`❌ Failed to update order ${order_number}: ${JSON.stringify(errMsg)}`);
    saveFailedPayload(req.body, errMsg);

    res.status(500).json({ error: "Something went wrong", details: errMsg });
  }
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});