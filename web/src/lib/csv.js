function escapeField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{ key, label }]; rows: array of plain objects. */
export function toCsv(columns, rows) {
  const header = columns.map((c) => escapeField(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeField(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}

export function csvResponse(filename, csv) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
