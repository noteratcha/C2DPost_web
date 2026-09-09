// C2DPost Helper - Service Worker (Background Script)
const API_KEY = "V9JN25IFH5hdZYc1k8NNRVgnLYXyQLzc";
const SHOP_ID = "18488";
const POSTONE_API_URL = "https://postone.thailandpost.com/api/bc.php";

/**
 * Calculate Thailand Post Check Digit using Modulus 11
 * Weights: 8, 6, 4, 2, 3, 5, 9, 7
 */
function calculateCheckDigit(serialStr) {
  if (serialStr.length !== 8) return "0";
  const weights = [8, 6, 4, 2, 3, 5, 9, 7];
  let total = 0;
  for (let i = 0; i < 8; i++) {
    total += parseInt(serialStr[i], 10) * weights[i];
  }
  const remainder = total % 11;
  if (remainder === 0) return "5";
  if (remainder === 1) return "0";
  return String(11 - remainder);
}

/**
 * Fetch barcodes from PostOne API using the client's Thailand IP address
 */
async function fetchPostOneBarcodes(count, typ = 2) {
  if (!count || count <= 0) {
    return { success: true, barcodes: [] };
  }

  const authString = btoa(`${SHOP_ID}:${API_KEY}`);
  const url = `${POSTONE_API_URL}?typ=${typ}&cnt=${count}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    let text = await response.text();
    // Remove UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.substring(1);
    }

    const data = JSON.parse(text);

    if (data.STATUS !== "SUCCESS") {
      throw new Error(data.MESSAGE || data.STATUS || "API returned unsuccess status");
    }

    const pre = data.PRE || "";
    const begin = parseInt(data.BEGIN, 10);
    const end = parseInt(data.END, 10);

    if (isNaN(begin) || isNaN(end) || begin > end) {
      throw new Error("Invalid serial range received from PostOne API");
    }

    const barcodes = [];
    const preLeft = pre.length >= 2 ? pre.substring(0, 2) : "RE";
    const preRight = pre.length >= 4 ? pre.substring(2, 4) : (pre.length >= 2 ? "TH" : "TH");

    for (let serial = begin; serial <= end; serial++) {
      const serialStr = String(serial).padStart(8, "0");
      const checkDigit = calculateCheckDigit(serialStr);
      const barcode = `${preLeft}${serialStr}${checkDigit}${preRight}`;
      barcodes.push(barcode);
    }

    return {
      success: true,
      barcodes: barcodes,
      count: barcodes.length
    };
  } catch (err) {
    console.error("[C2DPost Extension] Barcode fetch failed:", err);
    return {
      success: false,
      error: err.message
    };
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "PING") {
    sendResponse({
      success: true,
      version: "1.0.0",
      status: "connected"
    });
    return true;
  }

  if (message.action === "FETCH_BARCODES") {
    const count = parseInt(message.count, 10) || 1;
    const typ = parseInt(message.typ, 10) || 2;

    fetchPostOneBarcodes(count, typ).then(result => {
      sendResponse(result);
    });
    return true; // Keep message channel open for async response
  }
});
