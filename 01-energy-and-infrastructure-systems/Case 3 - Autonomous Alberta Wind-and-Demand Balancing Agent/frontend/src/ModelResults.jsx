import { useState, useEffect } from "react";

export default function ModelResults() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [expandedHours, setExpandedHours] = useState(false);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        const response = await fetch("http://localhost:8000/api/model-results");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setResults(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
        <div className="inline-block mb-4">
          <div className="h-8 w-8 border-4 border-slate-700 border-t-sky-400 rounded-full animate-spin"></div>
        </div>
        <p className="text-slate-300">Loading model results...</p>
        <p className="text-sm text-slate-500 mt-2">This may take 1-2 minutes on first run</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-900 bg-opacity-20 p-6">
        <h2 className="text-xl font-semibold text-red-400 mb-2">⚠️ Error</h2>
        <p className="text-red-300">{error}</p>
        <p className="text-sm text-red-400 mt-4">
          Make sure the backend is running:
        </p>
        <pre className="bg-slate-900 p-3 rounded mt-2 text-xs text-slate-300 overflow-auto">
          cd backend
          python -m uvicorn main:app --reload --port 8000
        </pre>
      </div>
    );
  }

  if (!results) return null;

  const best_model = results.model_results.find((m) => m.is_best);

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-700 overflow-x-auto pb-3">
        {["summary", "tight_hours", "models", "confusion", "features"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab
                ? "text-sky-400 border-b-2 border-sky-400"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            {tab === "summary" && "Summary"}
            {tab === "tight_hours" && "Tight Hours"}
            {tab === "models" && "Models"}
            {tab === "confusion" && "Confusion Matrix"}
            {tab === "features" && "Features"}
          </button>
        ))}
      </div>

      {/* Summary Tab */}
      {activeTab === "summary" && (
        <div className="space-y-4">
          {/* Data Summary */}
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold mb-4 text-sky-300">Data Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-3 rounded">
                <p className="text-xs text-slate-400 uppercase">Total Rows</p>
                <p className="text-2xl font-bold text-sky-400">
                  {results.data_info.total_rows.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-800 p-3 rounded">
                <p className="text-xs text-slate-400 uppercase">Features</p>
                <p className="text-2xl font-bold text-sky-400">
                  {results.data_info.total_columns}
                </p>
              </div>
              <div className="bg-slate-800 p-3 rounded col-span-2">
                <p className="text-xs text-slate-400 uppercase">Date Range</p>
                <p className="text-sm font-mono text-slate-300">
                  {results.data_info.date_range}
                </p>
              </div>
            </div>
          </div>

          {/* Tight Hours Definition - One-liner */}
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold mb-4 text-sky-300">Tight Hours Definition</h2>
            <div className="bg-slate-800 p-4 rounded-lg">
              <p className="text-sm text-slate-300 leading-relaxed">
                <strong>Score:</strong>{" "}
                <span className="text-amber-300 font-semibold">
                  {results.tight_definition_oneliner}
                </span>
              </p>
              <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
                <p>AIL threshold: <span className="text-sky-400">{results.tight_definition.ail_threshold.toFixed(0)} MW</span></p>
                <p>Wind threshold: <span className="text-sky-400">{results.tight_definition.wind_threshold.toFixed(0)} MW</span></p>
              </div>
            </div>
          </div>

          {/* Model Performance Metrics */}
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold mb-4 text-sky-300">Model Performance (Test Set)</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-4 rounded">
                <p className="text-xs text-slate-400 uppercase">Hits (True Positive)</p>
                <p className="text-3xl font-bold text-green-400 my-1">
                  {results.model_performance.hits}
                </p>
                <p className="text-xs text-slate-500">Correctly predicted tight</p>
              </div>
              <div className="bg-slate-800 p-4 rounded">
                <p className="text-xs text-slate-400 uppercase">Misses (False Negative)</p>
                <p className="text-3xl font-bold text-red-400 my-1">
                  {results.model_performance.misses}
                </p>
                <p className="text-xs text-slate-500">Missed tight hours</p>
              </div>
              <div className="bg-slate-800 p-4 rounded">
                <p className="text-xs text-slate-400 uppercase">False Alarms (False Positive)</p>
                <p className="text-3xl font-bold text-yellow-400 my-1">
                  {results.model_performance.false_alarms}
                </p>
                <p className="text-xs text-slate-500">False predictions</p>
              </div>
              <div className="bg-slate-800 p-4 rounded">
                <p className="text-xs text-slate-400 uppercase">Accuracy</p>
                <p className="text-3xl font-bold text-blue-400 my-1">
                  {(results.model_performance.accuracy * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500">Overall correctness</p>
              </div>
            </div>
          </div>

          {/* Held-out Week Analysis */}
          {results.held_out_week && results.held_out_week.count > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold mb-4 text-sky-300">
                Held-out Week Analysis ({results.held_out_week.count} hours)
              </h2>
              <div className="mb-4 p-4 bg-slate-800 rounded text-sm">
                <p className="text-slate-300">
                  <strong>Tight hours in this week:</strong>{" "}
                  <span className="text-amber-400 font-semibold">
                    {results.held_out_week.tight_hours}
                  </span>{" "}
                  ({((results.held_out_week.tight_hours / results.held_out_week.count) * 100).toFixed(1)}%)
                </p>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {results.held_out_week.data.map((hour, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded text-xs flex justify-between items-center ${
                      hour.is_tight
                        ? "bg-red-900 bg-opacity-30 border border-red-700"
                        : "bg-slate-700 border border-slate-600"
                    }`}
                  >
                    <div>
                      <span className="font-mono text-sky-300">
                        {new Date(hour.datetime).toLocaleDateString()} {new Date(hour.datetime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                      </span>
                      <span className={`ml-3 font-semibold ${hour.is_tight ? "text-red-300" : "text-green-300"}`}>
                        {hour.is_tight ? "🔴 TIGHT" : "✓ Normal"}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      AIL: <span className="text-amber-400">{hour.ail.toFixed(0)}</span> | 
                      Wind: <span className="text-green-400">{hour.wind.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Week-over-Week Comparison */}
          {results.week_over_week && results.week_over_week.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold mb-4 text-sky-300">
                Week-over-Week Comparison (Same Clock Hour)
              </h2>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {results.week_over_week.slice(0, 14).map((row, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded text-xs bg-slate-800 border border-slate-700"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-sky-300">
                        {new Date(row.datetime).toLocaleDateString()} {new Date(row.datetime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                      </span>
                      <div className="flex gap-4">
                        <div>
                          <span className="text-slate-400">This week: </span>
                          <span className={row.current_tight ? "text-red-400 font-semibold" : "text-green-400 font-semibold"}>
                            {row.current_tight ? "🔴 TIGHT" : "✓ Normal"}
                          </span>
                          <span className="text-slate-500"> ({row.current_ail.toFixed(0)} MW)</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Last week: </span>
                          <span className={row.last_week_tight ? "text-red-400 font-semibold" : "text-green-400 font-semibold"}>
                            {row.last_week_tight ? "🔴 TIGHT" : "✓ Normal"}
                          </span>
                          <span className="text-slate-500"> ({row.last_week_ail.toFixed(0)} MW)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {results.week_over_week.length > 14 && (
                <p className="text-xs text-slate-500 mt-3">Showing first 14 comparisons (scroll to see more)</p>
              )}
            </div>
          )}

          {/* Dispatch Recommendations */}
          {results.dispatch_recommendations && results.dispatch_recommendations.recommendations && results.dispatch_recommendations.recommendations.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold mb-4 text-sky-300">Dispatch Recommendations</h2>
              <div className="mb-4 p-4 bg-slate-800 rounded-lg text-sm border-l-4 border-sky-500">
                <p className="text-slate-200">
                  <strong>For tight hours (high demand + low wind):</strong> This date/time may have high demand and high price.
                </p>
                <p className="text-slate-300 mt-2">
                  Total reserve needed: <span className="text-sky-400 font-semibold">{results.dispatch_recommendations.reserve_needed_mw} MW</span>
                </p>
              </div>
              
              <div className="space-y-3">
                {results.dispatch_recommendations.recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-sky-500 transition"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-sky-300">
                          {rec.priority}  {rec.group}
                        </p>
                      </div>
                      <span className="px-2 py-1 bg-sky-500 text-slate-900 text-xs rounded font-bold">
                        {rec.recommend_dispatch_mw.toFixed(0)} MW
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">
                      {rec.reason}
                    </p>
                    <div className="text-xs text-slate-500 grid grid-cols-2 gap-2">
                      <div>Max capacity: <span className="text-sky-300">{rec.max_capacity_mw.toFixed(0)} MW</span></div>
                      <div>Dispatch reserve: <span className="text-sky-300">{rec.recommend_dispatch_mw.toFixed(0)} MW</span></div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 p-3 bg-slate-800 bg-opacity-70 rounded text-xs text-slate-400 border-t border-slate-700">
                <p>💡 <strong>Note:</strong> Recommendations prioritize resources with available dispatch contingency reserve that don't exceed maximum capacity.</p>
              </div>
            </div>
          )}

          {/* Test Tight Hours Card */}
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold mb-4 text-sky-300">Test Tight Hours</h2>
            <div className="bg-slate-800 p-6 rounded-lg text-center">
              <p className="text-sm text-slate-400 uppercase">Count</p>
              <p className="text-5xl font-bold text-sky-400 my-2">
                {results.tight_definition.count}
              </p>
              <p className="text-sm text-slate-400">
                {results.tight_definition.percentage.toFixed(1)}% of hours after {results.data_info.date_range.split(" to ")[0].split("T")[0]}
              </p>
            </div>
            <div className="mt-4 p-4 bg-slate-800 rounded text-sm">
              <p className="text-slate-300">
                <strong>Definition:</strong> AIL ≥ {results.tight_definition.ail_threshold.toFixed(0)} MW (Q{results.tight_definition.ail_percentile}) 
                <strong> AND </strong> 
                Wind ≤ {results.tight_definition.wind_threshold.toFixed(0)} MW (Q{results.tight_definition.wind_percentile})
              </p>
            </div>

            {/* Tight Hours List */}
            <div className="mt-6">
              <h3 className="text-md font-semibold mb-3 text-sky-300">Tight Hours Records</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {results.tight_hours.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No tight hours found</p>
                ) : (
                  results.tight_hours.map((hour, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-700 p-3 rounded border border-slate-600 hover:border-sky-500 transition text-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-mono text-sky-300">
                            {new Date(hour.datetime).toLocaleString()}
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <span className="text-slate-400">AIL: </span>
                              <span className="text-amber-400 font-semibold">
                                {hour.AIL.toFixed(0)} MW
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">Wind: </span>
                              <span className="text-green-400 font-semibold">
                                {hour.Wind.toFixed(0)} MW
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">#{idx + 1}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Showing all {results.tight_hours.length} tight hours. Scroll to see more.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tight Hours Tab - NEW */}
      {activeTab === "tight_hours" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-sky-300">
              Tight Hours List ({results.tight_hours.length})
            </h2>
            <button
              onClick={() => setExpandedHours(!expandedHours)}
              className="text-xs px-3 py-1 bg-slate-800 rounded hover:bg-slate-700 transition"
            >
              {expandedHours ? "Collapse" : "Expand All"}
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {results.tight_hours.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No tight hours found</p>
            ) : (
              results.tight_hours.map((hour, idx) => (
                <div
                  key={idx}
                  className="bg-slate-800 p-3 rounded border border-slate-700 hover:border-sky-500 transition text-sm"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono text-sky-300">
                        {new Date(hour.datetime).toLocaleString()}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400">AIL: </span>
                          <span className="text-amber-400 font-semibold">
                            {hour.AIL.toFixed(0)} MW
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Wind: </span>
                          <span className="text-green-400 font-semibold">
                            {hour.Wind.toFixed(0)} MW
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">#{idx + 1}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <p className="text-xs text-slate-500 mt-4">
            Showing all {results.tight_hours.length} tight hours. Scroll to see more.
          </p>
        </div>
      )}

      {/* Models Tab */}
      {activeTab === "models" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold mb-4 text-sky-300">Model Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400">Model</th>
                  <th className="text-right py-2 px-3 text-slate-400">Precision</th>
                  <th className="text-right py-2 px-3 text-slate-400">Recall</th>
                  <th className="text-right py-2 px-3 text-slate-400">F1 Score</th>
                  <th className="text-right py-2 px-3 text-slate-400">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {results.model_results.map((model, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-slate-700 ${
                      model.is_best ? "bg-sky-900 bg-opacity-30" : ""
                    }`}
                  >
                    <td className="py-3 px-3">
                      <span className="font-semibold">
                        {model.name}
                        {model.is_best && " ⭐"}
                      </span>
                    </td>
                    <td className="text-right py-3 px-3">
                      {(model.precision * 100).toFixed(1)}%
                    </td>
                    <td className="text-right py-3 px-3">
                      {(model.recall * 100).toFixed(1)}%
                    </td>
                    <td className="text-right py-3 px-3 font-semibold text-sky-400">
                      {(model.f1 * 100).toFixed(1)}%
                    </td>
                    <td className="text-right py-3 px-3 font-mono text-slate-400">
                      {model.threshold.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {best_model && (
            <p className="text-xs text-slate-400 mt-4">
              Best model: <strong>{best_model.name}</strong> (F1: {(best_model.f1 * 100).toFixed(1)}%)
            </p>
          )}
        </div>
      )}

      {/* Confusion Matrix Tab */}
      {activeTab === "confusion" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold mb-4 text-sky-300">
            Confusion Matrix ({best_model?.name})
          </h2>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div className="bg-green-900 bg-opacity-30 border border-green-700 p-4 rounded text-center">
              <p className="text-sm text-slate-400 uppercase">True Negative</p>
              <p className="text-3xl font-bold text-green-400">
                {results.confusion_matrix.true_negatives}
              </p>
            </div>
            <div className="bg-red-900 bg-opacity-30 border border-red-700 p-4 rounded text-center">
              <p className="text-sm text-slate-400 uppercase">False Positive</p>
              <p className="text-3xl font-bold text-red-400">
                {results.confusion_matrix.false_positives}
              </p>
            </div>
            <div className="bg-red-900 bg-opacity-30 border border-red-700 p-4 rounded text-center">
              <p className="text-sm text-slate-400 uppercase">False Negative</p>
              <p className="text-3xl font-bold text-red-400">
                {results.confusion_matrix.false_negatives}
              </p>
            </div>
            <div className="bg-green-900 bg-opacity-30 border border-green-700 p-4 rounded text-center">
              <p className="text-sm text-slate-400 uppercase">True Positive</p>
              <p className="text-3xl font-bold text-green-400">
                {results.confusion_matrix.true_positives}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Features Tab */}
      {activeTab === "features" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold mb-4 text-sky-300">
            Top 15 Feature Importance
          </h2>
          <div className="space-y-3">
            {results.feature_importance.map((feat, idx) => (
              <div key={idx}>
                <div className="flex justify-between mb-1 text-sm">
                  <span className="text-slate-300">{feat.feature}</span>
                  <span className="text-sky-400 font-semibold">
                    {(feat.importance * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded h-2 overflow-hidden">
                  <div
                    className="bg-sky-500 h-full transition-all duration-300"
                    style={{
                      width: `${(feat.importance / Math.max(...results.feature_importance.map((f) => f.importance))) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
