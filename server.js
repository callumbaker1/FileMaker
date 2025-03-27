// server.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// 🔐 FileMaker credentials from .env
const FILEMAKER_HOST = process.env.FILEMAKER_HOST; // e.g. "https://your-subdomain.fmphost.com"
const FILEMAKER_DATABASE = process.env.FILEMAKER_DATABASE; // e.g. "StickerShop"
const FILEMAKER_USER = process.env.FILEMAKER_USER;
const FILEMAKER_PASSWORD = process.env.FILEMAKER_PASSWORD;

// 🔑 Encode Basic Auth Header
function getBasicAuthHeader() {
  const token = Buffer.from(`${FILEMAKER_USER}:${FILEMAKER_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
}

// 🔌 Get FileMaker token
async function getFileMakerToken() {
  const response = await axios.post(
    `${FILEMAKER_HOST}/fmi/data/v1/databases/${FILEMAKER_DATABASE}/sessions`,
    {},
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: getBasicAuthHeader()
      }
    }
  );
  return response.data.response.token;
}

// 🔁 Update record by email
async function updateRecordByEmail(email, noteText) {
  const token = await getFileMakerToken();

  // 🔍 Find record by email
  const findResponse = await axios.post(
    `${FILEMAKER_HOST}/fmi/data/v1/databases/${FILEMAKER_DATABASE}/layouts/LayoutName/_find`,
    {
      query: [{ customer_email: email }]
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const recordId = findResponse.data.response.data[0].recordId;

  // ✏️ Update the note field
  await axios.patch(
    `${FILEMAKER_HOST}/fmi/data/v1/databases/${FILEMAKER_DATABASE}/layouts/LayoutName/records/${recordId}`,
    {
      fieldData: {
        note: noteText
      }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  console.log(`✅ Record for ${email} updated.`);
}

// 📬 Webhook endpoint
app.post("/webhook/kayako", async (req, res) => {
  try {
    const { customer_email, note } = req.body;
    await updateRecordByEmail(customer_email, note);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error updating record:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to update FileMaker record" });
  }
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`✅ Webhook server running on port ${PORT}`);
});

