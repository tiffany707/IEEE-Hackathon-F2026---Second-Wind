import { useState } from "react";
import DataTable from "./DataTable";

export default function App() {
  const [tab, setTab] = useState("overview");
  const [tableTitle, setTableTitle] = useState("AESO hourly data");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto min-h-screen max-w-5xl px-6 py-8">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-sky-400 uppercase">
            IEEE YP Industry Hackathon
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Alberta tight-hour warning
          </h1>
          <p className="mt-2 max-w-xl text-lg text-slate-400">
            Two tabs: an overview and a data listing from the bundled AESO CSV.
          </p>
        </header>

        <nav className="mb-6 flex gap-3">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "overview"
                ? "bg-sky-500 text-slate-900"
                : "bg-slate-800 text-slate-300"
            }`}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "data"
                ? "bg-sky-500 text-slate-900"
                : "bg-slate-800 text-slate-300"
            }`}
            onClick={() => setTab("data")}
          >
            Data
          </button>
        </nav>

        <section>
          {tab === "overview" && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
              <h2 className="mb-2 text-2xl font-semibold">Overview</h2>
              <p className="text-slate-400">
                This page will host the tight-hour warning UI. For now the demo
                shows the two-page layout. Switch to the Data tab to view the
                AESO hourly CSV (sample bundled in frontend/public/aeso_hourly_2024.csv).
              </p>
            </div>
          )}

          {tab === "data" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h2 className="text-xl font-semibold text-sky-300">
                  <input
                    className="w-full bg-transparent text-xl font-semibold text-sky-300 placeholder-sky-500 focus:outline-none"
                    value={tableTitle}
                    onChange={(e) => setTableTitle(e.target.value)}
                    aria-label="Table title"
                  />
                </h2>
                <p className="text-sm text-slate-400">Showing the first rows from the CSV.</p>
              </div>

              <DataTable maxRows={500} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
