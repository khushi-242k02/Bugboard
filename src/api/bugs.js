// Data source for the dashboard: a Google Sheet read as CSV.
// The sheet must be shared as "Anyone with the link can view".
// Configure it in .env.local (see .env.example).
//
// Each row is mapped to:
// { id, title, priority, status, assigned_to, reported_by, closed_date }
// Header names are matched loosely, so "Assigned To" works for assigned_to.

// Accepts either the bare sheet ID or the full sheet URL.
const SHEET_ID = (import.meta.env.VITE_SHEET_ID ?? '')
  .trim()
  .replace(/^.*\/spreadsheets\/d\/([^/?#]+).*$/, '$1')
const SHEET_NAME = import.meta.env.VITE_SHEET_NAME

const FIELDS = ['id', 'title', 'priority', 'status', 'assigned_to', 'reported_by', 'closed_date']

// Alternative header names accepted for a field.
const ALIASES = { id: ['bug_id'] }

export const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed']
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

// Maps a value to its canonical spelling, ignoring case and treating
// spaces, dashes and underscores alike ("in-progress" -> "In Progress").
// Unknown values are returned unchanged.
const simplify = (value) => value.toLowerCase().replace(/[\s_-]+/g, ' ').trim()

function canonical(value, allowed) {
  return allowed.find((option) => simplify(option) === simplify(value)) ?? value
}

// Parses CSV text into an array of rows, handling quoted fields,
// escaped quotes ("") and line breaks inside quotes.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const normalizeHeader = (header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_')

export async function fetchBugs() {
  if (!SHEET_ID) {
    throw new Error('VITE_SHEET_ID is not set. Add it to .env.local and restart the dev server.')
  }

  const params = new URLSearchParams({ tqx: 'out:csv' })
  if (SHEET_NAME) params.set('sheet', SHEET_NAME)
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params}`

  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Google Sheets responded with ${response.status}. Is the sheet shared as "Anyone with the link"?`)
  }

  const text = await response.text()
  if (text.trimStart().startsWith('<')) {
    throw new Error('Got an HTML page instead of CSV. Check that the sheet is shared as "Anyone with the link".')
  }

  const [headerRow = [], ...dataRows] = parseCsv(text)
  const headers = headerRow.map(normalizeHeader)

  return dataRows
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) => {
      const bug = {}
      FIELDS.forEach((key) => {
        const names = [key, ...(ALIASES[key] ?? [])]
        const index = headers.findIndex((header) => names.includes(header))
        bug[key] = index === -1 ? '' : (cells[index] ?? '').trim()
      })
      bug.status = canonical(bug.status, STATUSES)
      bug.priority = canonical(bug.priority, PRIORITIES)
      return bug
    })
}
