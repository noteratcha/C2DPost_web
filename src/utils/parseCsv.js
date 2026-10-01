export function parseCsv(csvText) {
  if (!csvText) return []
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = []
  let currentLine = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentLine += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine)
      currentLine = ''
    } else {
      currentLine += char
    }
  }
  if (currentLine) lines.push(currentLine)
  if (lines.length === 0) return []

  const headers = splitLine(lines[0])
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = splitLine(lines[i])
    if (values.length === 0) continue
    const row = {}
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx] !== undefined ? values[idx].trim() : ''
    })

    // Normalize vendor id field across possible variations
    const vid = (
      row['VendorID'] ||
      row['Vendor ID'] ||
      row['vendor_id'] ||
      row['vendorId'] ||
      row['VendorId'] ||
      row['เลข Vendor'] ||
      row['เลข Vendor (Vendor ID)'] ||
      ''
    ).trim()
    row.VendorID = vid
    row.vendor_id = vid
    row['Vendor ID'] = vid
    row.vendorId = vid

    rows.push(row)
  }

  return rows
}

function splitLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }
  values.push(current)
  return values
}