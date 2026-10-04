import { useEffect, useState } from "react";

export default function DataTable({ maxRows = 500 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch("/aeso_hourly_2024.csv")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        const lines = text.trim().split(/\r?\n/);
        if (lines.length === 0) {
          setRows([]);
          return;
        }
        const headers = lines[0].split(",").map((h) => h.trim());
        const parsed = lines.slice(1).map((line) => {
          const cols = line.split(",");
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = cols[i] === undefined ? "" : cols[i];
          });
          return obj;
        });
        setRows(parsed.slice(0, maxRows));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [maxRows]);

  if (loading) return <div className="p-4">Loading CSV…</div>;
  if (error)
    return (
      <div className="p-4 text-red-300">Error loading CSV: {error}</div>
    );
  if (!rows.length) return <div className="p-4">No rows found in CSV.</div>;

  const headers = Object.keys(rows[0]);

  return (
    <div className="overflow-auto rounded-lg border border-slate-800 bg-slate-900">
      <table className="w-full table-auto text-sm">
        <thead className="sticky top-0 bg-slate-800">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left font-medium text-sky-300"
              >
                {h} 
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={idx}
              className={idx % 2 === 0 ? "bg-slate-900" : "bg-slate-950"}
            >
              {headers.map((h) => (
                <td key={h} className="whitespace-nowrap px-3 py-2">
                  {r[h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
