"""Parser for local-government (เทศบาล / อบต.) tax mail produced by LTaxOnline mail-merge.

Supported documents (one record per envelope page "ชำระค่าฝากส่งเป็นรายเดือน"):
  - ภ.ด.ส.3  : letter + envelope
  - ภ.ด.ส.6  : letter + envelope + calculation sheets
  - หนังสือแจ้งเตือน : letter + envelope, many recipients per file

Envelope pages carry an invisible mail-merge template layer («flname», {เลขที่} and
PUA-encoded duplicates) underneath the real text, so text is read with PyMuPDF word
positions and template/PUA words are dropped.
"""
import re

try:
    import pymupdf
except ImportError:  # older PyMuPDF
    import fitz as pymupdf



def normalize_pdf_text(text):
    from .convert_dpost import normalize_pdf_text as _n
    return _n(text)


def clean_thai_digits(text):
    from .convert_dpost import clean_thai_digits as _c
    return _c(text)

COMP_ORDER_ID = "TaxLocalGovernment"
ORG_PATTERN = re.compile(r'(สำนักงานเทศบาล\S*|เทศบาล\S+|องค์การบริหารส่วน\S+|อบต\.\s*\S+)')
NAME_PREFIX = re.compile(r'^(นาย|นาง|น\.ส\.|นางสาว|ด\.ช\.|ด\.ญ\.|เด็ก|บริษัท|ห้าง|หจก|บจก|ร้าน|มูลนิธิ|วัด|พระ|ว่าที่|ร\.|พ\.|จ\.|ส\.|นพ\.|พญ\.|ดร\.|คุณ)')


def _is_template_word(w):
    return any(ch in w for ch in '«»{}΅') or any('' <= ch <= '' for ch in w)


def _norm(text):
    text = normalize_pdf_text(text or '')
    return text.replace('ํา', 'ำ')  # ํ + า -> ำ


def _page_segments(page):
    """Words grouped into visual rows, each row split into segments at large x gaps."""
    words = [w for w in page.get_text('words') if not _is_template_word(w[4])]
    words.sort(key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    rows = []
    for w in words:
        cy = (w[1] + w[3]) / 2
        if rows and abs(rows[-1]['cy'] - cy) < 4:
            rows[-1]['words'].append(w)
        else:
            rows.append({'cy': cy, 'words': [w]})
    segments = []
    for row in rows:
        ws = sorted(row['words'], key=lambda w: w[0])
        cur = [ws[0]]
        for w in ws[1:]:
            if w[0] - cur[-1][2] > 40:
                segments.append(cur)
                cur = [w]
            else:
                cur.append(w)
        segments.append(cur)
    out = []
    for seg in segments:
        out.append({
            'x0': seg[0][0], 'x1': seg[-1][2], 'cy': (seg[0][1] + seg[0][3]) / 2,
            'text': _norm(' '.join(w[4] for w in seg)).strip(),
        })
    out.sort(key=lambda s: (s['cy'], s['x0']))
    return out


def _is_envelope(text):
    t = re.sub(r'\s+', '', _norm(text))
    return ('ชำระค่าฝาก' in t and 'รายเดือน' in t) or 'ใบอนุญาตเลขที่' in t


def _extract_tel(text):
    t = clean_thai_digits(_norm(text))
    m = re.search(r'โทร[ศัพท์]*\.?\s*:?\s*([0-9][0-9\- ]{7,14}[0-9])', t)
    if not m:
        return ''
    digits = re.sub(r'\D', '', m.group(1))
    return digits[:10] if len(digits) >= 9 else ''


def _detect_doc_kind(text):
    t = re.sub(r'\s+', '', _norm(text))
    if 'แจ้งเตือนให้ชำระ' in t or 'แจ้งเตือนภ.ด.ส' in t:
        return 'หนังสือแจ้งเตือน'
    m = re.search(r'ภ\.ด\.ส\.?([0-9๐-๙]+)', clean_thai_digits(t))
    if m and m.group(1) in ('3', '4', '6'):
        return f'ภ.ด.ส.{m.group(1)}'
    return ''


def is_municipal_pdf(pdf_path):
    """True when the file is local-government tax mail (sender is เทศบาล/อบต., not a land office)."""
    try:
        doc = pymupdf.open(pdf_path)
    except Exception:
        return False
    try:
        for page in doc:
            text = page.get_text()
            if _is_envelope(text):
                norm = _norm(text)
                return bool(ORG_PATTERN.search(norm)) and 'สำนักงานที่ดิน' not in norm
        return False
    finally:
        doc.close()


def _split_sender_address(line):
    """'1695 ถ.สุขเกษม ต.ธาตุเชิงชุม อ.เมือง สน 47000' -> (address, amphur, province, zipcode)."""
    line = clean_thai_digits(line)
    zm = re.search(r'([0-9]{5})\s*$', line)
    zipcode = zm.group(1) if zm else ''
    rest = line[:zm.start()].strip() if zm else line
    tokens = rest.split()
    province = ''
    if len(tokens) > 1:
        province = tokens.pop()
    amphur = ''
    for i, tok in enumerate(tokens):
        if tok.startswith(('อ.', 'อำเภอ', 'เขต')):
            amphur = ' '.join(tokens[i:])
            tokens = tokens[:i]
            break
    # Unspaced headers ("1695 ถนนสุขเกษมสน47000"): the popped "province" is really the street
    if province and (not amphur) and re.search(r'^(ถนน|ถ\.|ซอย|ซ\.|หมู่|ม\.|ต\.|ตำบล)', province):
        tokens.append(province)
        province = ''
    zip_province, zip_amphur = _zip_area(zipcode)
    return ' '.join(tokens), amphur or zip_amphur, province or zip_province, zipcode


_ZIP_AREA = None


def _zip_area(zipcode):
    """(province, amphur) for a zipcode when the postcode table maps it to a single one."""
    global _ZIP_AREA
    if _ZIP_AREA is None:
        import json, os
        _ZIP_AREA = {}
        try:
            with open(os.path.join(os.path.dirname(__file__), 'thai_postcodes.json'), encoding='utf-8') as f:
                for key, z in json.load(f).items():
                    parts = key.split('|')
                    if len(parts) >= 2:  # skip amphur-only alias keys
                        _ZIP_AREA.setdefault(str(z), set()).add((parts[0], parts[1]))
        except Exception:
            pass
    areas = _ZIP_AREA.get(str(zipcode), set())
    provinces = {p for p, _ in areas}
    amphurs = {a for _, a in areas}
    return (provinces.pop() if len(provinces) == 1 else '',
            amphurs.pop() if len(amphurs) == 1 else '')


def _parse_envelope(segments, page_width):
    left_max = page_width * 0.22
    right_min = page_width * 0.70

    org_name, sender_addr_line, tel = '', '', ''
    for s in segments:
        t = s['text']
        if not org_name:
            m = ORG_PATTERN.search(t)
            if m and 'ชำระ' not in t:
                org_name = m.group(1)
        if not sender_addr_line and s['x0'] < left_max and re.match(r'^[0-9๐-๙]', t) \
                and re.search(r'[0-9๐-๙]{5}\s*$', t):
            sender_addr_line = t
        if not tel:
            tel = _extract_tel(t)

    # Receiver block: middle column, below the sender header
    receiver = [s for s in segments
                if left_max <= s['x0'] < right_min and s['cy'] < page_width * 0.62
                and not s['text'].startswith(('(', 'A.R', 'ชำระ', 'ใบอนุญาต'))
                and not ORG_PATTERN.fullmatch(s['text'])]
    lines = [s['text'] for s in receiver]
    if lines and lines[0].startswith('เรียน'):
        lines[0] = lines[0][len('เรียน'):].strip()
        if not lines[0]:
            lines.pop(0)
    if not lines:
        return None

    name = re.sub(r'\s+', ' ', lines[0]).strip()
    tambon = amphur = province = zipcode = ''
    addr_parts = []
    for line in lines[1:]:
        cl = clean_thai_digits(line)
        zm = re.search(r'([0-9]{5})\s*$', cl)
        if zm:
            zipcode = zm.group(1)
            cl = cl[:zm.start()].strip()
            if not cl:
                continue
        if cl.startswith('จังหวัด'):
            province = 'จังหวัด ' + cl[len('จังหวัด'):].strip()
            continue
        tm = re.search(r'(ตำบล(?:/แขวง)?|แขวง)\s*(.+?)\s*(?=(อำเภอ|เขต)|$)', cl)
        am = re.search(r'(อำเภอ(?:/เขต)?|เขต)\s*(.+)$', cl)
        if tm or am:
            if tm:
                tambon = f'{tm.group(1)} {tm.group(2).strip()}'
            if am:
                amphur = f'{am.group(1)} {am.group(2).strip()}'
            continue
        addr_parts.append(re.sub(r'^เลขที่\s*', '', cl))

    address = ' '.join(p for p in addr_parts + [tambon] if p).strip()
    s_addr, s_amphur, s_province, s_zip = _split_sender_address(sender_addr_line) if sender_addr_line else ('', '', '', '')
    return {
        'RECEIVER': name,
        'RECEIVER ADDRESS': address or '-',
        'RECEIVER AMPHUR': amphur,
        'RECEIVER PROVINCE': province,
        'RECEIVER ZIPCODE': zipcode,
        'SHIPPER NAME': org_name,
        'SHIPPER ADDRESS': s_addr or '-',
        'SHIPPER AMPHUR': s_amphur,
        'SHIPPER PROVINCE': s_province,
        'SHIPPER ZIPCODE': s_zip,
        'SHIPPER TEL': tel,
    }


def process_municipal_pdf(pdf_path):
    """One record per envelope page; letter pages before it supply doc type / fallback tel."""
    doc = pymupdf.open(pdf_path)
    records = []
    try:
        pending_text = ''
        file_kind = ''
        for i, page in enumerate(doc):
            text = page.get_text()
            if not _is_envelope(text):
                pending_text += '\n' + text
                file_kind = file_kind or _detect_doc_kind(text)
                continue
            rec = _parse_envelope(_page_segments(page), page.rect.width)
            if not rec or not rec.get('RECEIVER'):
                pending_text = ''
                continue
            kind = _detect_doc_kind(pending_text) or _detect_doc_kind(text) or file_kind or 'หนังสือแจ้ง'
            if not rec['SHIPPER TEL']:
                rec['SHIPPER TEL'] = _extract_tel(pending_text)
            rec.update({
                'PRODUCT IN BOX': kind,
                'COMP_ORDER_ID': COMP_ORDER_ID,
                'REF NO': '',
                'WEIGHT': '20',
                'SOURCE_FILE': pdf_path,
                '_src_idx': i,
            })
            records.append(rec)
            pending_text = ''
        # Fill missing sender tel from any record of the same file
        file_tel = next((r['SHIPPER TEL'] for r in records if r['SHIPPER TEL']), '')
        for r in records:
            r['SHIPPER TEL'] = r['SHIPPER TEL'] or file_tel
    finally:
        doc.close()
    return records


def stamp_anchor(pdf_path, page_index):
    """Where to stamp the e-AR/QR/barcode on a municipal envelope page (PDF coords, origin bottom-left).

    Returns ('notice', ar_center_x, ar_bottom, left_x, left_bottom) for notice envelopes with an
    "A.R." mark, ('rian', x, y) for envelopes with "เรียน" (stamp to its left, box bottom on its baseline),
    ('box', x_left, y_bottom) for envelopes without it (stamp under the top-right permit box), or None.
    """
    try:
        doc = pymupdf.open(pdf_path)
    except Exception:
        return None
    try:
        page = doc[page_index]
        height = page.rect.height
        width = page.rect.width
        segs = _page_segments(page)
        rian = next((s for s in segs if s['text'].startswith('เรียน') and s['cy'] < height * 0.5), None)
        ar = next((s for s in segs if s['text'].replace(' ', '').startswith('A.R') and s['cy'] < height * 0.2), None)
        if rian and ar:
            # Notice envelope (sample layout): e-AR box under the "A.R." mark,
            # QR + barcode in the left column under the sender block
            left = [s for s in segs if s['x0'] < width * 0.22 and s['cy'] < rian['cy'] + 2]
            left_bottom = max((s['cy'] for s in left), default=rian['cy'])
            left_x = min((s['x0'] for s in left), default=40)
            return ('notice', (ar['x0'] + ar['x1']) / 2, height - ar['cy'] - 8, left_x, height - left_bottom - 10)
        if rian:
            return ('rian', rian['x0'], height - rian['cy'] - 4)
        box = [s for s in segs if s['x0'] > width * 0.6 and s['cy'] < height * 0.2]
        if box:
            # ignore the "(แจ้งเตือน ...)" style captions that sit below the box
            box = [s for s in box if not s['text'].startswith('(')] or box
            return ('box', min(s['x0'] for s in box), height - max(s['cy'] for s in box) - 8)
        return None
    finally:
        doc.close()
