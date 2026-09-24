#!/usr/bin/env node
/*
 * CI encoding guard (ASCII-only source, by design).
 *
 * Scans source and build output for "mojibake" evidence: byte sequences that
 * appear when Thai UTF-8 text is mis-decoded as a Latin/cp874 code page and
 * re-encoded as UTF-8 (double-encoding). Fails the build (exit 1) on hard
 * signals in source/js bundles so corrupted Thai can never be deployed.
 *
 * Usage:
 *   node encoding_guard.mjs               # src + public + dist
 *   node encoding_guard.mjs --src-only    # src + public only
 *   node encoding_guard.mjs --dist-only   # dist/assets only
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEXT_EXT = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.html', '.css',
  '.md', '.svg', '.txt', '.yml', '.yaml', '.xml', '.vue', '.svelte',
]);
const SKIP = new Set(['node_modules', '.git', '.vercel']);
const HARD_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte']);

// Byte-signatures of UTF-8 double-encoding for Thai (U+0E00..U+0EFF).
// Thai UTF-8 bytes are 0xE0/0xE1 then 0xB8/0xB9 .. 0xBF. When those raw bytes are
// widened to Latin-1 and re-encoded as UTF-8 you get: C3 A0 / C3 A1 (the E0/E1)
// followed by C2 B8 / C2 B9 etc. We match the re-encoded UTF-8 byte pairs.
const THAI_DOUBLE = /(?:\u00e0|\u00e1)(?:\u00b8|\u00b9)[\u0080-\u00ff]*/g;
// Generic Latin-uppercase (<0xE0..) followed by continuation bytes.
const LATIN_DUP = /[\u00c0-\u00df][\u0080-\u00bf]+/g;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, out);
    else if (TEXT_EXT.has(extname(name))) out.push(p);
  }
  return out;
}

function checkFile(file) {
  const buf = readFileSync(file);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return { file, validUtf8: false, thai: 0, latin: 0 };
  }
  return {
    file,
    validUtf8: true,
    thai: (text.match(THAI_DOUBLE) || []).length,
    latin: (text.match(LATIN_DUP) || []).length,
  };
}

function main() {
  const args = process.argv.slice(2);
  const srcOnly = args.includes('--src-only');
  const distOnly = args.includes('--dist-only');

  const targets = [];
  if (!distOnly) {
    for (const d of ['src', 'public']) walk(join(__dirname, d), targets);
  }
  if (!srcOnly) {
    walk(join(__dirname, 'dist', 'assets'), targets);
  }

  let failures = 0;
  let suspects = 0;
  const problems = [];
  for (const f of targets) {
    const r = checkFile(f);
    if (!r.validUtf8) {
      failures++;
      problems.push(`INVALID UTF-8: ${f}`);
      continue;
    }
    if (r.thai > 0) {
      if (HARD_EXT.has(extname(f).toLowerCase())) {
        failures++;
        problems.push(`MOJIBAKE(${r.thai}): ${f}`);
      } else {
        suspects++;
        problems.push(`SUSPECT(${r.thai}): ${f}`);
      }
    } else if (r.latin > 12) {
      suspects++;
      problems.push(`DUP-UTF8(${r.latin}): ${f}`);
    }
  }

  if (failures > 0) {
    console.error('Encoding guard FAILED:');
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }
  console.log(
    `Encoding guard OK: ${targets.length} files checked` +
    (suspects ? ` (${suspects} non-blocking suspects)` : '') + '.'
  );
}

main();
