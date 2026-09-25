/**
 * ThailandMap.jsx — SVG แผนที่ประเทศไทย 77 จังหวัด
 * ไฮไลต์จังหวัดที่ระบุด้วยสีพิเศษ + Tooltip แสดงชื่อจังหวัด
 * ใช้ใน TrackingTimelineModal เพื่อแสดงตำแหน่งสถานะล่าสุดของพัสดุ
 */
import React, { useMemo } from 'react';
import './ThailandMap.css';

// ────────────────────────────────────────────────────────────────
// Province data: { id, nameTH, nameEN, cx, cy } — centroid coords
// in the SVG viewBox (0 0 360 600)
// ────────────────────────────────────────────────────────────────
export const PROVINCES = [
  // ภาคเหนือ
  { id: 'chiangrai',    nameTH: 'เชียงราย',    nameEN: 'Chiang Rai',    cx: 122, cy: 58  },
  { id: 'chiangmai',   nameTH: 'เชียงใหม่',   nameEN: 'Chiang Mai',    cx: 92,  cy: 95  },
  { id: 'maehongson',  nameTH: 'แม่ฮ่องสอน',  nameEN: 'Mae Hong Son',  cx: 55,  cy: 93  },
  { id: 'lampang',     nameTH: 'ลำปาง',       nameEN: 'Lampang',       cx: 130, cy: 110 },
  { id: 'lamphun',     nameTH: 'ลำพูน',       nameEN: 'Lamphun',       cx: 108, cy: 115 },
  { id: 'phrae',       nameTH: 'แพร่',        nameEN: 'Phrae',         cx: 155, cy: 118 },
  { id: 'nan',         nameTH: 'น่าน',        nameEN: 'Nan',           cx: 177, cy: 103 },
  { id: 'phayao',      nameTH: 'พะเยา',       nameEN: 'Phayao',        cx: 155, cy: 80  },
  // ภาคเหนือตอนล่าง
  { id: 'tak',         nameTH: 'ตาก',         nameEN: 'Tak',           cx: 77,  cy: 145 },
  { id: 'sukhothai',   nameTH: 'สุโขทัย',     nameEN: 'Sukhothai',     cx: 125, cy: 148 },
  { id: 'uttaradit',   nameTH: 'อุตรดิตถ์',   nameEN: 'Uttaradit',     cx: 162, cy: 130 },
  { id: 'phitsanulok', nameTH: 'พิษณุโลก',    nameEN: 'Phitsanulok',   cx: 152, cy: 163 },
  { id: 'phichit',     nameTH: 'พิจิตร',      nameEN: 'Phichit',       cx: 162, cy: 188 },
  { id: 'kamphaengphet',nameTH: 'กำแพงเพชร',  nameEN: 'Kamphaeng Phet',cx: 115, cy: 178 },
  { id: 'phetchabun',  nameTH: 'เพชรบูรณ์',   nameEN: 'Phetchabun',    cx: 188, cy: 186 },
  { id: 'nakhonsawan', nameTH: 'นครสวรรค์',   nameEN: 'Nakhon Sawan',  cx: 145, cy: 210 },
  { id: 'uthaithani',  nameTH: 'อุทัยธานี',   nameEN: 'Uthai Thani',   cx: 125, cy: 224 },
  { id: 'chainat',     nameTH: 'ชัยนาท',      nameEN: 'Chai Nat',      cx: 150, cy: 236 },
  // ภาคกลาง
  { id: 'lopburi',     nameTH: 'ลพบุรี',      nameEN: 'Lop Buri',      cx: 185, cy: 225 },
  { id: 'singburi',    nameTH: 'สิงห์บุรี',    nameEN: 'Sing Buri',     cx: 168, cy: 240 },
  { id: 'angthong',    nameTH: 'อ่างทอง',     nameEN: 'Ang Thong',     cx: 175, cy: 255 },
  { id: 'ayutthaya',   nameTH: 'พระนครศรีอยุธยา',nameEN: 'Ayutthaya',  cx: 188, cy: 265 },
  { id: 'saraburi',    nameTH: 'สระบุรี',      nameEN: 'Saraburi',      cx: 210, cy: 252 },
  { id: 'nakhonnayok', nameTH: 'นครนายก',     nameEN: 'Nakhon Nayok',  cx: 228, cy: 265 },
  { id: 'pathumthani', nameTH: 'ปทุมธานี',    nameEN: 'Pathum Thani',  cx: 190, cy: 275 },
  { id: 'nonthaburi',  nameTH: 'นนทบุรี',     nameEN: 'Nonthaburi',    cx: 182, cy: 283 },
  { id: 'bangkok',     nameTH: 'กรุงเทพมหานคร',nameEN: 'Bangkok',       cx: 200, cy: 291 },
  { id: 'nakhonpathom',nameTH: 'นครปฐม',      nameEN: 'Nakhon Pathom', cx: 164, cy: 290 },
  { id: 'suphanburi',  nameTH: 'สุพรรณบุรี',  nameEN: 'Suphan Buri',   cx: 150, cy: 268 },
  { id: 'kanchanaburi',nameTH: 'กาญจนบุรี',   nameEN: 'Kanchanaburi',  cx: 110, cy: 275 },
  { id: 'ratchaburi',  nameTH: 'ราชบุรี',     nameEN: 'Ratchaburi',    cx: 140, cy: 306 },
  { id: 'samutsakon',  nameTH: 'สมุทรสาคร',   nameEN: 'Samut Sakhon',  cx: 175, cy: 306 },
  { id: 'samutprakan', nameTH: 'สมุทรปราการ', nameEN: 'Samut Prakan',  cx: 213, cy: 300 },
  { id: 'samutsongkhram',nameTH: 'สมุทรสงคราม',nameEN:'Samut Songkhram',cx: 153, cy: 315 },
  { id: 'phetchaburi', nameTH: 'เพชรบุรี',    nameEN: 'Phetchaburi',   cx: 143, cy: 338 },
  { id: 'prachuapkhirikhan',nameTH: 'ประจวบคีรีขันธ์',nameEN:'Prachuap Khiri Khan',cx: 140,cy: 373},
  // ภาคตะวันออก
  { id: 'chachoengsao',nameTH: 'ฉะเชิงเทรา', nameEN: 'Chachoengsao',  cx: 234, cy: 283 },
  { id: 'chonburi',    nameTH: 'ชลบุรี',      nameEN: 'Chon Buri',     cx: 240, cy: 300 },
  { id: 'rayong',      nameTH: 'ระยอง',       nameEN: 'Rayong',        cx: 255, cy: 312 },
  { id: 'chanthaburi', nameTH: 'จันทบุรี',    nameEN: 'Chanthaburi',   cx: 277, cy: 315 },
  { id: 'trat',        nameTH: 'ตราด',        nameEN: 'Trat',          cx: 294, cy: 305 },
  { id: 'prachinburi', nameTH: 'ปราจีนบุรี',  nameEN: 'Prachin Buri',  cx: 250, cy: 270 },
  { id: 'sakeaw',      nameTH: 'สระแก้ว',     nameEN: 'Sa Kaeo',       cx: 263, cy: 285 },
  // ภาคตะวันออกเฉียงเหนือ
  { id: 'nongkhai',    nameTH: 'หนองคาย',     nameEN: 'Nong Khai',     cx: 233, cy: 150 },
  { id: 'loei',        nameTH: 'เลย',         nameEN: 'Loei',          cx: 208, cy: 168 },
  { id: 'udonthani',   nameTH: 'อุดรธานี',    nameEN: 'Udon Thani',    cx: 252, cy: 168 },
  { id: 'nongbualamphu',nameTH: 'หนองบัวลำภู',nameEN: 'Nong Bua Lam Phu',cx: 228,cy: 176},
  { id: 'buengkan',    nameTH: 'บึงกาฬ',      nameEN: 'Bueng Kan',     cx: 264, cy: 148 },
  { id: 'sakonnakhon', nameTH: 'สกลนคร',      nameEN: 'Sakon Nakhon',  cx: 280, cy: 168 },
  { id: 'nakhonphanom',nameTH: 'นครพนม',      nameEN: 'Nakhon Phanom', cx: 298, cy: 183 },
  { id: 'mukdahan',    nameTH: 'มุกดาหาร',    nameEN: 'Mukdahan',      cx: 296, cy: 205 },
  { id: 'kalasin',     nameTH: 'กาฬสินธุ์',   nameEN: 'Kalasin',       cx: 268, cy: 198 },
  { id: 'khonkaen',    nameTH: 'ขอนแก่น',     nameEN: 'Khon Kaen',     cx: 250, cy: 198 },
  { id: 'mahasarakham',nameTH: 'มหาสารคาม',   nameEN: 'Maha Sarakham', cx: 274, cy: 216 },
  { id: 'roiet',       nameTH: 'ร้อยเอ็ด',    nameEN: 'Roi Et',        cx: 288, cy: 225 },
  { id: 'yasothon',    nameTH: 'ยโสธร',       nameEN: 'Yasothon',      cx: 298, cy: 243 },
  { id: 'amnatcharoen',nameTH: 'อำนาจเจริญ',  nameEN: 'Amnat Charoen', cx: 306, cy: 256 },
  { id: 'ubonratchathani',nameTH: 'อุบลราชธานี',nameEN:'Ubon Ratchathani',cx: 312,cy: 268},
  { id: 'sisaket',     nameTH: 'ศรีสะเกษ',    nameEN: 'Si Sa Ket',     cx: 287, cy: 263 },
  { id: 'surin',       nameTH: 'สุรินทร์',    nameEN: 'Surin',         cx: 265, cy: 260 },
  { id: 'buriram',     nameTH: 'บุรีรัมย์',   nameEN: 'Buri Ram',      cx: 247, cy: 250 },
  { id: 'nakhonratchasima',nameTH: 'นครราชสีมา',nameEN:'Nakhon Ratchasima',cx: 225,cy: 242},
  { id: 'chaiyaphum',  nameTH: 'ชัยภูมิ',     nameEN: 'Chaiyaphum',    cx: 225, cy: 220 },
  // ภาคใต้
  { id: 'chumphon',    nameTH: 'ชุมพร',       nameEN: 'Chumphon',      cx: 175, cy: 408 },
  { id: 'suratthani',  nameTH: 'สุราษฎร์ธานี',nameEN: 'Surat Thani',   cx: 190, cy: 438 },
  { id: 'ranong',      nameTH: 'ระนอง',       nameEN: 'Ranong',        cx: 145, cy: 416 },
  { id: 'nakhonsithammarat',nameTH: 'นครศรีธรรมราช',nameEN:'Nakhon Si Thammarat',cx: 208,cy: 470},
  { id: 'phangnga',    nameTH: 'พังงา',       nameEN: 'Phang-nga',     cx: 155, cy: 463 },
  { id: 'phuket',      nameTH: 'ภูเก็ต',      nameEN: 'Phuket',        cx: 143, cy: 485 },
  { id: 'krabi',       nameTH: 'กระบี่',      nameEN: 'Krabi',         cx: 167, cy: 490 },
  { id: 'trang',       nameTH: 'ตรัง',        nameEN: 'Trang',         cx: 178, cy: 518 },
  { id: 'phatthalung', nameTH: 'พัทลุง',      nameEN: 'Phatthalung',   cx: 200, cy: 508 },
  { id: 'satun',       nameTH: 'สตูล',        nameEN: 'Satun',         cx: 178, cy: 540 },
  { id: 'songkhla',    nameTH: 'สงขลา',       nameEN: 'Songkhla',      cx: 210, cy: 537 },
  { id: 'pattani',     nameTH: 'ปัตตานี',     nameEN: 'Pattani',       cx: 223, cy: 555 },
  { id: 'yala',        nameTH: 'ยะลา',        nameEN: 'Yala',          cx: 213, cy: 568 },
  { id: 'narathiwat',  nameTH: 'นราธิวาส',    nameEN: 'Narathiwat',    cx: 228, cy: 576 },
];

// ────────────────────────────────────────────────────────────────
// Province name → id mapping (normalized for fuzzy match)
// ────────────────────────────────────────────────────────────────
const PROVINCE_NAME_MAP = (() => {
  const map = {};
  PROVINCES.forEach(p => {
    map[p.nameTH] = p.id;
    const clean = p.nameTH.replace(/^จังหวัด|^จ\./, '').trim();
    map[clean] = p.id;
    map[p.nameEN.toLowerCase()] = p.id;
  });
  // Aliases
  map['โคราช'] = 'nakhonratchasima';
  map['นครราชสีมา'] = 'nakhonratchasima';
  map['อยุธยา'] = 'ayutthaya';
  map['พระนครศรีอยุธยา'] = 'ayutthaya';
  map['กรุงเทพ'] = 'bangkok';
  map['กทม'] = 'bangkok';
  map['กทม.'] = 'bangkok';
  map['กรุงเทพมหานคร'] = 'bangkok';
  map['อุบล'] = 'ubonratchathani';
  map['บุรีรัมย์'] = 'buriram';
  map['บุรีรัมย'] = 'buriram';
  map['นครศรีธรรมราช'] = 'nakhonsithammarat';
  map['นครพนม'] = 'nakhonphanom';
  map['บึงกาฬ'] = 'buengkan';
  map['สกลนคร'] = 'sakonnakhon';
  map['เรณูนคร'] = 'nakhonphanom';
  map['ปลาปาก'] = 'nakhonphanom';
  map['ธาตุพนม'] = 'nakhonphanom';
  map['ท่าอุเทน'] = 'nakhonphanom';
  map['ศรีสงคราม'] = 'nakhonphanom';
  map['บ้านแพง'] = 'nakhonphanom';
  map['นาหว้า'] = 'nakhonphanom';
  map['โพนสวรรค์'] = 'nakhonphanom';
  return map;
})();

/**
 * Map of 2-digit Thai zipcode prefixes → province id.
 * Used to resolve the province from a 5-digit zipcode alone
 * (e.g. the zipcode attached to the latest tracking status).
 */
export const ZIP_PREFIX_MAP = {
  '10': 'bangkok', '11': 'nonthaburi', '12': 'pathumthani', '13': 'ayutthaya',
  '14': 'angthong', '15': 'lopburi', '16': 'singburi', '17': 'chainat',
  '18': 'saraburi', '19': 'nakhonnayok', '20': 'chonburi', '21': 'rayong',
  '22': 'chanthaburi', '23': 'trat', '24': 'chachoengsao', '25': 'prachinburi',
  '26': 'nakhonnayok', '27': 'sakeaw', '30': 'nakhonratchasima', '31': 'buriram',
  '32': 'surin', '33': 'sisaket', '34': 'ubonratchathani', '35': 'yasothon',
  '36': 'chaiyaphum', '37': 'amnatcharoen', '38': 'buengkan', '39': 'nongbualamphu',
  '40': 'khonkaen', '41': 'udonthani', '42': 'loei', '43': 'nongkhai',
  '44': 'mahasarakham', '45': 'roiet', '46': 'kalasin', '47': 'sakonnakhon',
  '48': 'nakhonphanom', '49': 'mukdahan', '50': 'chiangmai', '51': 'lamphun',
  '52': 'lampang', '53': 'uttaradit', '54': 'phrae', '55': 'nan',
  '56': 'phayao', '57': 'chiangrai', '58': 'maehongson', '60': 'nakhonsawan',
  '61': 'uthaithani', '62': 'kamphaengphet', '63': 'tak', '64': 'sukhothai',
  '65': 'phitsanulok', '66': 'phichit', '67': 'phetchabun', '70': 'ratchaburi',
  '71': 'kanchanaburi', '72': 'suphanburi', '73': 'nakhonpathom', '74': 'samutsakon',
  '75': 'samutsongkhram', '76': 'phetchaburi', '77': 'prachuapkhirikhan',
  '80': 'nakhonsithammarat', '81': 'krabi', '82': 'phangnga', '83': 'phuket',
  '84': 'suratthani', '85': 'ranong', '86': 'chumphon', '90': 'songkhla',
  '91': 'satun', '92': 'trang', '93': 'phatthalung', '94': 'pattani',
  '95': 'yala', '96': 'narathiwat',
};

/**
 * Resolve a province id from a 5-digit Thai zipcode using its 2-digit prefix.
 * @param {string|number} zipcode - e.g. "48170" → 'nakhonphanom'
 * @returns {string|null} province id, or null if not resolvable
 */
export function provinceIdFromZipcode(zipcode) {
  if (zipcode === null || zipcode === undefined) return null;
  const z = String(zipcode).trim();
  const m = z.match(/\b(\d{5})\b/);
  if (!m) return null;
  const prefix = m[1].substring(0, 2);
  return ZIP_PREFIX_MAP[prefix] || null;
}

/**
 * Extract province id from a location string like "เรณูนคร 48170" or "ศป.นครพนม"
 * or zipcode prefix
 */
export function extractProvinceFromLocation(location) {
  if (!location || typeof location !== 'string') return null;
  const loc = location.trim();

  // 1. Direct / partial province name lookup (longest match first to avoid false positives)
  const sortedKeys = Object.keys(PROVINCE_NAME_MAP).sort((a, b) => b.length - a.length);
  for (const name of sortedKeys) {
    if (name && name.length >= 2 && loc.includes(name)) {
      return PROVINCE_NAME_MAP[name];
    }
  }

  // 2. Zipcode → province heuristic via prefix
    const zipMatch = loc.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    const prefix = zip.substring(0, 2);
    if (ZIP_PREFIX_MAP[prefix]) return ZIP_PREFIX_MAP[prefix];
  }

  return null;
}

// Region colors for province dots
const REGION_COLORS = {
  north:     '#bae6fd',  // sky-200
  northeast: '#bbf7d0',  // green-200
  central:   '#fde68a',  // amber-200
  east:      '#ddd6fe',  // violet-200
  south:     '#fecdd3',  // rose-200
};

const PROVINCE_REGIONS = {
  chiangrai:'north', chiangmai:'north', maehongson:'north', lampang:'north',
  lamphun:'north', phrae:'north', nan:'north', phayao:'north',
  tak:'north', sukhothai:'north', uttaradit:'north',
  phitsanulok:'north', phichit:'north', kamphaengphet:'north', phetchabun:'north',
  nakhonsawan:'central', uthaithani:'central', chainat:'central', lopburi:'central',
  singburi:'central', angthong:'central', ayutthaya:'central', saraburi:'central',
  nakhonnayok:'central', pathumthani:'central', nonthaburi:'central',
  bangkok:'central', nakhonpathom:'central', suphanburi:'central',
  kanchanaburi:'central', ratchaburi:'central', samutsakon:'central',
  samutprakan:'central', samutsongkhram:'central', phetchaburi:'central',
  prachuapkhirikhan:'central',
  chachoengsao:'east', chonburi:'east', rayong:'east', chanthaburi:'east',
  trat:'east', prachinburi:'east', sakeaw:'east',
  nongkhai:'northeast', loei:'northeast', udonthani:'northeast',
  nongbualamphu:'northeast', buengkan:'northeast', sakonnakhon:'northeast',
  nakhonphanom:'northeast', mukdahan:'northeast', kalasin:'northeast',
  khonkaen:'northeast', mahasarakham:'northeast', roiet:'northeast',
  yasothon:'northeast', amnatcharoen:'northeast', ubonratchathani:'northeast',
  sisaket:'northeast', surin:'northeast', buriram:'northeast',
  nakhonratchasima:'northeast', chaiyaphum:'northeast',
  chumphon:'south', suratthani:'south', ranong:'south', nakhonsithammarat:'south',
  phangnga:'south', phuket:'south', krabi:'south', trang:'south',
  phatthalung:'south', satun:'south', songkhla:'south', pattani:'south',
  yala:'south', narathiwat:'south',
};

// ────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────
export default function ThailandMap({ highlightProvinceId, locationText, statusLabel }) {
  const highlightProv = useMemo(() => {
    if (!highlightProvinceId) return null;
    return PROVINCES.find(p => p.id === highlightProvinceId) || null;
  }, [highlightProvinceId]);

  return (
    <div className="th-map-wrapper">
      <div className="th-map-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span className="th-map-title">ตำแหน่งสถานะล่าสุด</span>
      </div>

      <div className="th-map-svg-container">
        <svg
          viewBox="0 0 360 600"
          xmlns="http://www.w3.org/2000/svg"
          className="th-map-svg"
          role="img"
          aria-label="แผนที่ประเทศไทย"
        >
          {/* Background outline of Thailand (simplified schematic) */}
          <path
            d="
              M 112,14 C 128,10 158,14 182,26 C 200,35 218,28 238,42
              C 258,52 268,44 283,60 C 298,76 293,92 278,102
              C 263,112 268,122 258,137 C 248,152 263,162 258,177
              C 253,192 268,202 263,217 C 258,232 278,242 273,257
              C 268,272 288,277 283,292 C 278,307 298,312 296,327
              C 294,342 303,357 293,367 C 283,377 276,382 268,392
              C 260,402 253,400 246,410 C 239,420 230,417 223,427
              C 216,437 213,447 208,457 C 203,467 210,482 203,492
              C 196,502 193,512 196,522 C 199,532 208,540 213,550
              C 218,560 226,567 223,580 C 220,593 213,600 203,600
              L 163,600 C 156,598 148,590 150,580 C 152,568 158,560 156,550
              C 154,540 146,532 143,522 C 140,512 143,502 138,492
              C 133,482 128,472 126,462 C 124,452 123,442 118,432
              C 113,422 108,417 106,407 C 104,397 108,387 103,377
              C 98,367 90,357 86,347 C 82,337 88,322 80,312
              C 72,302 60,297 56,282 C 52,267 63,260 58,244
              C 53,228 46,220 48,202 C 50,184 60,177 56,160
              C 52,143 40,135 42,117 C 44,99 58,90 53,72
              C 48,54 68,44 83,32 C 98,20 96,18 112,14 Z
            "
            fill="var(--th-map-bg, rgba(226,232,240,0.4))"
            stroke="var(--th-map-border, rgba(148,163,184,0.6))"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Province dots */}
          {PROVINCES.map(prov => {
            const isHighlight = prov.id === highlightProvinceId;
            const region = PROVINCE_REGIONS[prov.id] || 'central';
            const baseColor = REGION_COLORS[region] || '#e2e8f0';
            const r = isHighlight ? 10 : 5.5;

            return (
              <g key={prov.id} className={`prov-dot-group${isHighlight ? ' highlight' : ''}`}>
                {isHighlight && (
                  <>
                    <circle cx={prov.cx} cy={prov.cy} r={22} fill="rgba(16,185,129,0.12)" className="prov-pulse-ring-outer"/>
                    <circle cx={prov.cx} cy={prov.cy} r={16} fill="rgba(16,185,129,0.22)" className="prov-pulse-ring-inner"/>
                  </>
                )}
                <circle
                  cx={prov.cx}
                  cy={prov.cy}
                  r={r}
                  fill={isHighlight ? '#10b981' : baseColor}
                  stroke={isHighlight ? '#059669' : 'rgba(100,116,139,0.5)'}
                  strokeWidth={isHighlight ? 2 : 0.6}
                  className={`prov-dot${isHighlight ? ' prov-dot-active' : ''}`}
                />
                {isHighlight && (
                  <>
                    {/* White dot center */}
                    <circle cx={prov.cx} cy={prov.cy} r={3.5} fill="#ffffff" opacity="0.9"/>
                    {/* Province name bubble */}
                    <rect
                      x={prov.cx - 40}
                      y={prov.cy - 33}
                      width={80}
                      height={17}
                      rx="5"
                      ry="5"
                      fill="#059669"
                      opacity="0.95"
                    />
                    <text
                      x={prov.cx}
                      y={prov.cy - 21}
                      textAnchor="middle"
                      fontSize="8.5"
                      fill="#ffffff"
                      fontWeight="700"
                      fontFamily="'Prompt', 'Inter', sans-serif"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {prov.nameTH}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Info bar below map */}
      {highlightProv ? (
        <div className="th-map-info active">
          <div className="th-map-province-row">
            <span className="th-map-pin-dot"/>
            <span className="th-map-province-name">{highlightProv.nameTH}</span>
          </div>
          {locationText && (
            <div className="th-map-location-text" title={locationText}>{locationText}</div>
          )}
          {statusLabel && (
            <div className="th-map-status-tag">{statusLabel}</div>
          )}
        </div>
      ) : (
        <div className="th-map-info idle">
          <span className="th-map-idle-text">ไม่พบข้อมูลตำแหน่ง</span>
        </div>
      )}
    </div>
  );
}
