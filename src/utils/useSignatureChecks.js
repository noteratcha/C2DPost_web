/**
 * useSignatureChecks — verify whether delivered parcels have a recipient signature image
 * on their official e-AR (electronic Advice of Receipt).
 *
 * Uses fetchEarDetailsClient (extension fetch of the e-AR PDF + backend parse), which returns
 * `signature_image` as a data URL when a signature is present, or '' when the e-AR has none.
 *
 * Results (yes / no) are remembered per barcode in sessionStorage so revisiting a page does
 * not re-download e-AR PDFs; images themselves are kept in memory only.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchEarDetailsClient } from './earService';

const SIG_CACHE_KEY = 'c2dpost_signature_check_cache';
const CONCURRENCY = 3;

function loadCache() {
  try {
    const raw = sessionStorage.getItem(SIG_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(map) {
  try {
    const slim = {};
    Object.entries(map).forEach(([bc, v]) => {
      if (v && (v.state === 'yes' || v.state === 'no')) slim[bc] = { state: v.state };
    });
    sessionStorage.setItem(SIG_CACHE_KEY, JSON.stringify(slim));
  } catch {
    // storage full / disabled -> results stay in memory only
  }
}

/**
 * @param {string[]} barcodes - delivered barcodes currently visible
 * @param {boolean} enabled - false on devices without the extension (mobile)
 * @returns {{ checks: Object<string, {state: 'loading'|'yes'|'no'|'error', image?: string}>,
 *             recheck: (barcode: string) => void,
 *             loadImage: (barcode: string) => Promise<string> }}
 */
export function useSignatureChecks(barcodes, enabled = true) {
  const [checks, setChecks] = useState(loadCache);
  const checksRef = useRef(checks);
  const inflight = useRef(new Set());
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    checksRef.current = checks;
    saveCache(checks);
  }, [checks]);

  const runCheck = useCallback(async (bc) => {
    inflight.current.add(bc);
    setChecks((prev) => ({ ...prev, [bc]: { state: 'loading' } }));
    let next;
    try {
      const res = await fetchEarDetailsClient(bc);
      if (!res) next = { state: 'error' };
      else if (res.signature_image) next = { state: 'yes', image: res.signature_image };
      else next = { state: 'no' };
    } catch {
      next = { state: 'error' };
    }
    inflight.current.delete(bc);
    setChecks((prev) => ({ ...prev, [bc]: next }));
    return next;
  }, []);

  const barcodeKey = barcodes.join(',');
  useEffect(() => {
    if (!enabled) return;
    const todo = barcodes.filter((bc) => bc && !checksRef.current[bc] && !inflight.current.has(bc));
    if (todo.length === 0) return;

    let index = 0;
    const worker = async () => {
      while (index < todo.length) {
        const bc = todo[index++];
        if (checksRef.current[bc] || inflight.current.has(bc)) continue;
        await runCheck(bc);
      }
    };
    Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker);
    // Started checks are allowed to finish after page changes; results are cached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeKey, enabled, retryTick, runCheck]);

  const recheck = useCallback((bc) => {
    setChecks((prev) => {
      const copy = { ...prev };
      delete copy[bc];
      return copy;
    });
    checksRef.current = { ...checksRef.current, [bc]: undefined };
    setRetryTick((t) => t + 1);
  }, []);

  // Image for a "yes" result restored from sessionStorage (image not persisted)
  const loadImage = useCallback(async (bc) => {
    const current = checksRef.current[bc];
    if (current?.image) return current.image;
    const res = await runCheck(bc);
    return res?.image || '';
  }, [runCheck]);

  return { checks, recheck, loadImage };
}
