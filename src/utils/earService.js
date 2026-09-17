/**
 * earService.js — Client-Side e-AR Fetching & Parsing Pipeline
 * 
 * Bypasses foreign server geoblocking (Akamai / Thai Post edge) by querying 
 * https://e-ar.thailandpost.com/ear-api/print/e-ar directly from the user's browser in Thailand (CORS enabled).
 * Then passes the received PDF bytes to our API backend to extract signature thumbnail and metadata.
 */

import { API_BASE } from './api';

const earCache = new Map();

/**
 * Fetch official e-AR PDF directly from Thailand Post, then parse signature & metadata.
 * 
 * @param {string} barcode - Parcel barcode (e.g. "BC414111081TH")
 * @returns {Promise<{has_ear: boolean, blob_url: string, relationship: string, delivery_officer: string, status: string, signature_image: string}>}
 */
export async function fetchEarDetailsClient(barcode) {
  const cleanBarcode = (barcode || '').trim().toUpperCase();
  if (!cleanBarcode) return null;

  if (earCache.has(cleanBarcode)) {
    return earCache.get(cleanBarcode);
  }

  try {
    // 1. Fetch PDF directly from Thailand Post e-AR API (CORS enabled: Access-Control-Allow-Origin: *)
    const res = await fetch('https://e-ar.thailandpost.com/ear-api/print/e-ar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([cleanBarcode])
    });

    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/pdf')) {
      return null;
    }

    const blob = await res.blob();
    if (blob.size < 500) {
      return null;
    }

    const blobUrl = URL.createObjectURL(blob);

    // 2. Send PDF bytes to backend parser to extract signature thumbnail and text
    let parsedData = {
      relationship: '',
      delivery_officer: '',
      status: '',
      signature_image: ''
    };

    try {
      const parseRes = await fetch(`${API_BASE}/reports/parse-ear-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf'
        },
        body: blob
      });

      if (parseRes.ok) {
        const json = await parseRes.json();
        if (json.success && json.data) {
          parsedData = json.data;
        }
      }
    } catch (parseErr) {
      console.warn('Backend e-AR parsing notice:', parseErr);
    }

    const finalResult = {
      has_ear: true,
      barcode: cleanBarcode,
      blob_url: blobUrl,
      relationship: parsedData.relationship || '',
      delivery_officer: parsedData.delivery_officer || '',
      status: parsedData.status || '',
      signature_image: parsedData.signature_image || ''
    };

    earCache.set(cleanBarcode, finalResult);
    return finalResult;
  } catch (err) {
    console.warn(`e-AR client fetch error for ${cleanBarcode}:`, err);
    return null;
  }
}
