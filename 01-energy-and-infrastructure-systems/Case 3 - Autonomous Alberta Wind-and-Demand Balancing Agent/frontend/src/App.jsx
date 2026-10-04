import { useState } from "react";
import DataTable from "./DataTable";
import ModelResults from "./ModelResults";
import findings from "./findings.json";

const SIGNAL = {
  ail: "Load",
  wind: "Wind",
  price: "Pool price",
};

function featureLabel(name) {
  const lag = name.match(/^(ail|wind|price)_lag_(\d+)$/);
  if (lag) {
    const hours = Number(lag[2]);
    const when = hours === 168 ? "1 week ago" : hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    return `${SIGNAL[lag[1]]} ${when}`;
  }
  const roll = name.match(/^(ail|wind)_(mean|std)_(\d+)h$/);
  if (roll) {
    const kind = roll[2] === "mean" ? "average" : "volatility";
    return `${SIGNAL[roll[1]]} ${roll[3]}h ${kind}`;
  }
  const change = name.match(/^(ail|wind)_change_1h$/);
  if (change) return `${SIGNAL[change[1]]} ramp, last hour`;
  const labels = {
    hour_sin: "Hour of day",
    hour_cos: "Hour of day (cycle)",
    dow_sin: "Day of week",
    dow_cos: "Day of week (cycle)",
    month: "Month",
    is_weekend: "Weekend",
  };
  return labels[name] ?? name;
}

function fmt(n, digits = 0) {
  return Number(n).toLocaleString("en-CA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function score(n) {
  return n == null ? "—" : Number(n).toFixed(3);
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs tracking-wide text-slate-400 uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{value}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Confusion({ title, matrix }) {
  const [[tn, fp], [fn, tp]] = matrix;
  const cells = [
    { label: "True calm", value: tn, tone: "text-slate-200" },
    { label: "False alarm", value: fp, tone: "text-amber-300" },
    { label: "Missed tight", value: fn, tone: "text-rose-300" },
    { label: "Caught tight", value: tp, tone: "text-emerald-300" },
  ];
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">Held-out test hours</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-lg bg-slate-950 px-3 py-3">
            <p className="text-xs text-slate-500">{cell.label}</p>
            <p className={`mt-1 text-xl font-semibold ${cell.tone}`}>{fmt(cell.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Findings() {
  const best = findings.models.find((m) => m.model === findings.bestModel);
  const baseline = findings.models.find((m) => m.model === "Same hour last week");
  const maxF1 = Math.max(...findings.models.map((m) => m.f1), 0.01);
  const maxImportance = Math.max(...findings.importance.map((f) => f.mean), 0.001);
  const maxHour = Math.max(...findings.byHour.map((h) => h.tight), 1);
  const maxDay = Math.max(...findings.daily.flatMap((d) => [d.tight, d.warnings]), 1);
  const [original, stricter] = findings.sensitivity;
  const maxWarnings = Math.max(original.warningsSentTest, stricter.warningsSentTest, 1);
  const priceLift = findings.prices.tight.median / findings.prices.notTight.median;

  return (
    <div className="space-y-6">
      <section
        className={`rounded-xl border p-5 ${
          findings.beatsBaseline
            ? "border-emerald-900 bg-emerald-950/40"
            : "border-amber-900 bg-amber-950/40"
        }`}
      >
        <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
          Held-out result
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          {findings.beatsBaseline
            ? `${findings.bestModel} beats guessing the same hour last week.`
            : "The tested models do not beat the same hour last week."}
        </h2>
        <p className="mt-2 max-w-3xl text-slate-300">
          On the unseen final 20% of 2024, {findings.bestModel} reaches F1 {score(findings.bestF1)}{" "}
          against the weekly baseline F1 {score(findings.baselineF1)}{" "}
          {`(${(findings.f1Lift >= 0 ? "+" : "") + score(findings.f1Lift)}).`} A tight hour is load at or above {fmt(findings.definition.loadCutoffMw)} MW
          and wind at or below {fmt(findings.definition.windCutoffMw)} MW, using cutoffs from the training
          period only.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Load cutoff"
          value={`${fmt(findings.definition.loadCutoffMw)} MW`}
          hint="Training 80th percentile of AIL"
        />
        <Stat
          label="Wind cutoff"
          value={`${fmt(findings.definition.windCutoffMw)} MW`}
          hint="Training 20th percentile of wind"
        />
        <Stat
          label="Test tight hours"
          value={fmt(best.actualTightHours)}
          hint={`${(findings.definition.testTightRate * 100).toFixed(1)}% of hours after ${findings.dataset.splitTime.slice(0, 10)}`}
        />
        <Stat
          label="Warnings sent"
          value={fmt(best.warningsSent)}
          hint={`${findings.bestModel} on the test period`}
        />
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Model comparison</h2>
            <p className="mt-1 text-sm text-slate-400">
              Precision is the share of warnings that were truly tight. Recall is the share of tight hours that were caught.
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-4 font-medium">Model</th>
                <th className="py-2 pr-4 font-medium">Precision</th>
                <th className="py-2 pr-4 font-medium">Recall</th>
                <th className="py-2 pr-4 font-medium">F1</th>
                <th className="py-2 pr-4 font-medium">PR-AUC</th>
                <th className="py-2 font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {findings.models.map((model) => (
                <tr key={model.model} className="border-t border-slate-800">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-100">{model.model}</div>
                    <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          model.model === findings.bestModel ? "bg-sky-400" : "bg-slate-500"
                        }`}
                        style={{ width: `${(model.f1 / maxF1) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{score(model.precision)}</td>
                  <td className="py-3 pr-4 tabular-nums">{score(model.recall)}</td>
                  <td className="py-3 pr-4 font-medium tabular-nums text-sky-300">{score(model.f1)}</td>
                  <td className="py-3 pr-4 tabular-nums">{score(model.prAuc)}</td>
                  <td className="py-3 tabular-nums">{fmt(model.warningsSent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Confusion title="Same hour last week" matrix={baseline.confusion} />
        <Confusion title={findings.bestModel} matrix={best.confusion} />
      </section>

      <section className="grid gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-3">
          <h2 className="text-lg font-semibold">When tight hours happen</h2>
          <p className="mt-1 text-sm text-slate-400">
            Count of actual tight hours in the test period, by clock hour.
          </p>
          <div className="mt-5 flex h-36 items-end gap-1">
            {findings.byHour.map((hour) => (
              <div key={hour.hour} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className="rounded-sm bg-sky-400/80"
                  style={{ height: `${(hour.tight / maxHour) * 100}%` }}
                  title={`${hour.hour}:00 · ${hour.tight} tight hours`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Price afterward</h2>
          <p className="mt-1 text-sm text-slate-400">
            Pool price was not used to define tight hours. It is context for the same test hours.
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-slate-400">Median, not tight</dt>
              <dd className="font-medium tabular-nums">${fmt(findings.prices.notTight.median, 2)} / MWh</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-slate-400">Median, tight</dt>
              <dd className="font-medium tabular-nums text-amber-300">
                ${fmt(findings.prices.tight.median, 2)} / MWh
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-slate-400">Mean, tight</dt>
              <dd className="tabular-nums">${fmt(findings.prices.tight.mean, 2)} / MWh</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-slate-400">Peak, tight</dt>
              <dd className="tabular-nums">${fmt(findings.prices.tight.max, 2)} / MWh</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-slate-300">
            The median tight hour was {priceLift.toFixed(1)}× the median calm hour.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-semibold">Recent warning history</h2>
        <p className="mt-1 text-sm text-slate-400">
          Last 60 days of the test period. Sky bars are actual tight hours. Amber bars are {findings.bestModel} warnings.
        </p>
        <div className="mt-5 flex h-32 items-end gap-1">
          {findings.daily.map((day) => (
            <div key={day.date} className="flex h-full flex-1 items-end gap-px" title={`${day.date}: ${day.tight} tight, ${day.warnings} warnings`}>
              <div className="w-1/2 rounded-sm bg-sky-400/80" style={{ height: `${(day.tight / maxDay) * 100}%` }} />
              <div className="w-1/2 rounded-sm bg-amber-400/80" style={{ height: `${(day.warnings / maxDay) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-slate-500">
          <span>{findings.daily[0]?.date}</span>
          <span>{findings.daily.at(-1)?.date}</span>
        </div>
      </section>

      {/* <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">What the model uses</h2>
          <p className="mt-1 text-sm text-slate-400">
            Drop in held-out average precision when a feature is shuffled. Predictive, not causal.
          </p>
          <ul className="mt-4 space-y-2">
            {findings.importance.map((item) => (
              <li key={item.feature}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="text-slate-200">{featureLabel(item.feature)}</span>
                  <span className="tabular-nums text-slate-500">{item.mean.toFixed(3)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-sky-400"
                    style={{ width: `${Math.max((item.mean / maxImportance) * 100, 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">Change the definition once</h2>
          <p className="mt-1 text-sm text-slate-400">
            The same model family is retrained on a stricter rule. Warning counts are for the same test window.
          </p>
          <div className="mt-5 space-y-4">
            {[original, stricter].map((row) => (
              <div key={row.definition}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-slate-200">{row.definition}</span>
                  <span className="tabular-nums text-slate-300">{fmt(row.warningsSentTest)} warnings</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${(row.warningsSentTest / maxWarnings) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Load ≥ {fmt(row.loadCutoffMw)} MW and wind ≤ {fmt(row.windCutoffMw)} MW · F1 {score(row.f1)} · {fmt(row.actualTightTest)} actual tight hours
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-slate-300">
            {`Warnings moved from ${fmt(original.warningsSentTest)} to ${fmt(stricter.warningsSentTest)} (${(findings.warningChange >= 0 ? "+" : "") + fmt(findings.warningChange)}).`}
          </p>
        </div>
      </section> */}

      <p className="text-xs text-slate-500">
        {findings.dataset.rows.toLocaleString("en-CA")} hourly rows, {findings.dataset.start.slice(0, 10)} to{" "}
        {findings.dataset.end.slice(0, 10)}. Train ends {findings.dataset.splitTime}. {findings.dataset.features} leakage-safe features. Current-hour load, wind, and price are not model inputs.
      </p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("overview");
  const [tableTitle, setTableTitle] = useState("AESO hourly data");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-sky-400 uppercase">
            IEEE YP Industry Hackathon
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Alberta tight-hour warning</h1>
          <p className="mt-2 max-w-2xl text-lg text-slate-400">
            Hours when Alberta load is high and wind is low, scored against guessing the same hour last week.
          </p>
        </header>

        <nav className="mb-6 flex gap-3">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "overview" ? "bg-sky-500 text-slate-900" : "bg-slate-800 text-slate-300"
            }`}
            onClick={() => setTab("overview")}
          >
            Findings
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "data" ? "bg-sky-500 text-slate-900" : "bg-slate-800 text-slate-300"
            }`}
            onClick={() => setTab("data")}
          >
            Data
          </button>
        </nav>

        <section>
          {tab === "overview" && (
            <div className="space-y-8">
              <Findings />
              <ModelResults />
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
