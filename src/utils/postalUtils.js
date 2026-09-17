/**
 * postalUtils.js - Postal station and zipcode resolution utilities for C2DPost.
 * Formats post office / station names with corresponding 5-digit zipcodes.
 */

export const MAIL_CENTERS = {
  "หาดใหญ่": "90110",
  "นครพนม": "48000",
  "ขอนแก่น": "40000",
  "นครราชสีมา": "30000",
  "โคราช": "30000",
  "อุดรธานี": "41000",
  "อุบลราชธานี": "34000",
  "นครสวรรค์": "60000",
  "พิษณุโลก": "65000",
  "เด่นชัย": "54110",
  "ลำพูน": "51000",
  "เชียงใหม่": "50000",
  "สุราษฎร์ธานี": "84000",
  "ทุ่งสง": "80110",
  "ชุมพร": "86000",
  "ภูเก็ต": "83000",
  "ศรีราชา": "20110",
  "กบินทร์บุรี": "25110",
  "อยุธยา": "13000",
  "พระนครศรีอยุธยา": "13000",
  "ราชบุรี": "70000",
  "สุวรรณภูมิ": "10540",
  "กรุงเทพ": "10210",
  "หลักสี่": "10210",
  "ด่วนพิเศษ": "10210",
  "ems": "10210"
};

export const KNOWN_DISTRICT_ZIPCODES = {
  // Nakhon Phanom
  "เรณูนคร": "48170",
  "นาแก": "48130",
  "ปลาปาก": "48160",
  "ธาตุพนม": "48110",
  "ท่าอุเทน": "48120",
  "ศรีสงคราม": "48150",
  "บ้านแพง": "48140",
  "นาหว้า": "48180",
  "โพนสวรรค์": "48190",
  "นาทม": "48140",
  "วังยาง": "48130",
  "เมืองนครพนม": "48000",
  "นครพนม": "48000",
  // Mukdahan
  "เมืองมุกดาหาร": "49000",
  "มุกดาหาร": "49000",
  "นิคมคำสร้อย": "49130",
  "ดอนตาล": "49120",
  "ดงหลวง": "49140",
  "คำชะอี": "49110",
  "หว้านใหญ่": "49150",
  "หนองสูง": "49160",
  // Sakon Nakhon
  "เมืองสกลนคร": "47000",
  "สกลนคร": "47000",
  "กุสุมาลย์": "47210",
  "กุดบาก": "47180",
  "พรรณานิคม": "47130",
  "พังโคน": "47160",
  "วาริชภูมิ": "47150",
  "อากาศอำนวย": "47170",
  "สว่างแดนดิน": "47110",
  "คำตากล้า": "47250",
  "บ้านม่วง": "47140",
  "โพนนาแก้ว": "47230",
  "ภูพาน": "47180",
  "เต่างอย": "47260",
  "โคกศรีสุพรรณ": "47280",
  "เจริญศิลป์": "47290",
  // Common hubs & cities
  "บัวใหญ่": "30120",
  "ปากช่อง": "30130",
  "วารินชำราบ": "34190",
  "ชุมแพ": "40130",
  "บ้านไผ่": "40110",
  "บางพลี": "10540",
  "คลองจั่น": "10240",
  "จตุจักร": "10900",
  "ลาดพร้าว": "10230",
  "มีนบุรี": "10510",
  "บางซื่อ": "10800",
  "นนทบุรี": "11000",
  "ปากเกร็ด": "11120"
};

/**
 * Cleans prefix from post office name (e.g. "ศป. หาดใหญ่" -> "หาดใหญ่", "ปณ. นาแก" -> "นาแก")
 */
export function cleanStationName(name) {
  if (!name) return '';
  return name.trim().replace(/^(ศปฝ\.|ศป\.|ปณศ\.|ปณร\.|ปณ\.|ที่ทำการไปรษณีย์)\s*/i, '').trim();
}

/**
 * Formats station name with 5-digit zipcode appended.
 * @param {string} station - Station / Post office name
 * @param {object} [record] - Optional item record containing destination/shipper/status info
 * @returns {string} Station name with zipcode, e.g. "เรณูนคร 48170", "ศป. หาดใหญ่ 90110"
 */
export function formatStationWithZipcode(station, record = null) {
  if (!station || String(station).trim() === '' || String(station).trim() === '-') {
    return '-';
  }
  const st = String(station).trim();

  // 1. If already contains 5-digit zipcode, return as is
  if (/\b\d{5}\b/.test(st)) {
    return st;
  }

  const clean = cleanStationName(st).toLowerCase();
  const isMailCenter = /ศป\.|ศปฝ\.|ศูนย์ไปรษณีย์/i.test(st);

  // 2. Check Mail Centers
  for (const [mcName, zcode] of Object.entries(MAIL_CENTERS)) {
    const mcLower = mcName.toLowerCase();
    if (st.toLowerCase().includes(mcLower) || clean === mcLower) {
      if (isMailCenter || ["หาดใหญ่", "เด่นชัย", "ทุ่งสง", "กบินทร์บุรี", "ศรีราชา", "สุวรรณภูมิ", "หลักสี่", "ด่วนพิเศษ", "ems"].includes(mcName)) {
        return `${st} ${zcode}`;
      } else if (clean === mcLower && isMailCenter) {
        return `${st} ${zcode}`;
      }
    }
  }

  // 3. Check Origin / Sender office
  const shipperZc = (record && record.shipper_zipcode) || '48170';
  const receivedPo = (record && record.received_postoffice) || '';
  if (st.includes('เรณูนคร')) {
    return `${st} 48170`;
  }
  if (receivedPo && clean === cleanStationName(receivedPo).toLowerCase()) {
    return `${st} ${shipperZc}`;
  }

  // 4. Check Receiver / Destination match
  if (record) {
    const rcvZc = (record.receiver_zipcode || '').trim();
    const rcvAmp = (record.receiver_amphur || '').trim().toLowerCase();
    const rcvProv = (record.receiver_province || '').trim().toLowerCase();
    const rcvAddr = (record.receiver_address || '').trim().toLowerCase();

    if (rcvZc && rcvZc.length === 5) {
      if (clean && (rcvAmp.includes(clean) || rcvAddr.includes(clean) || (rcvProv.includes(clean) && !isMailCenter))) {
        return `${st} ${rcvZc}`;
      }

      // If status indicates final delivery or out for delivery, and not a mail center
      const statusDesc = String(record.status_description || record.status_label || '');
      const rawDesc = String(record.status_description_raw || '');
      const combinedDesc = `${statusDesc} ${rawDesc}`;
      const deliveryKeywords = ['นำจ่าย', 'สำเร็จ', 'ผู้รับได้รับ', 'บ้านปิด', 'ออกใบแจ้ง', 'รอจ่าย'];
      if (!isMailCenter && deliveryKeywords.some(kw => combinedDesc.includes(kw))) {
        return `${st} ${rcvZc}`;
      }
    }
  }

  // 5. Check Known District dictionary
  for (const [dName, zcode] of Object.entries(KNOWN_DISTRICT_ZIPCODES)) {
    if (clean === dName || clean.includes(dName)) {
      return `${st} ${zcode}`;
    }
  }

  // 6. Fallback to Mail Centers if clean matches
  for (const [mcName, zcode] of Object.entries(MAIL_CENTERS)) {
    if (clean === mcName.toLowerCase()) {
      return `${st} ${zcode}`;
    }
  }

  return st;
}
