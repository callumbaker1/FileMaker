require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

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

// 🔐 Basic auth header
const basicAuth = Buffer.from(`${FM_USER}:${FM_PASS}`).toString("base64");

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

// 🔎 Find record & update
app.post("/webhook", async (req, res) => {
    try {
        const orderNumber = req.body.order_number;
        if (!orderNumber) return res.status(400).json({ error: "Missing order_number" });

        const token = await getToken();

        // Search for record
        const findResponse = await axios.post(
            `${FM_HOST}/fmi/data/v1/databases/${FM_DATABASE}/layouts/${FM_LAYOUT}/_find`,
            {
                query: [{ Shopify_OrderNumber: orderNumber }],
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const recordId = findResponse.data.response.data[0].recordId;

        // Update field
        await axios.patch(
            `${FM_HOST}/fmi/data/v1/databases/${FM_DATABASE}/layouts/${FM_LAYOUT}/records/${recordId}`,
            {
                fieldData: {
                    FOUND: "YES",
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        res.json({ success: true, message: "Record updated!" });
    } catch (error) {
        console.error("❌ Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Something went wrong" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});