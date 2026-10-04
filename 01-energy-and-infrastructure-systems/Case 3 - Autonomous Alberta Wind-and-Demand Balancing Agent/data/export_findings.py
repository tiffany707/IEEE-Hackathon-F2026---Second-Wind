"""Reproduce the notebook and write dashboard findings as JSON."""

from pathlib import Path
import json

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
)
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

RANDOM_STATE = 42
ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "aeso_hourly_2024.csv"
OUT_PATH = ROOT / "frontend" / "src" / "findings.json"


def add_features(x):
    x = x.copy()
    ts = x.timestamp
    x["hour"] = ts.dt.hour
    x["dow"] = ts.dt.dayofweek
    x["month"] = ts.dt.month
    x["is_weekend"] = (x.dow >= 5).astype(int)
    x["hour_sin"] = np.sin(2 * np.pi * x.hour / 24)
    x["hour_cos"] = np.cos(2 * np.pi * x.hour / 24)
    x["dow_sin"] = np.sin(2 * np.pi * x.dow / 7)
    x["dow_cos"] = np.cos(2 * np.pi * x.dow / 7)

    for lag in [1, 2, 3, 6, 12, 24, 48, 168]:
        x[f"ail_lag_{lag}"] = x.ail_mw.shift(lag)
        x[f"wind_lag_{lag}"] = x.wind_mw.shift(lag)
    for lag in [1, 24, 168]:
        x[f"price_lag_{lag}"] = x.pool_price_cad_per_mwh.shift(lag)

    prior_ail = x.ail_mw.shift(1)
    prior_wind = x.wind_mw.shift(1)
    for w in [6, 24, 72, 168]:
        x[f"ail_mean_{w}h"] = prior_ail.rolling(w).mean()
        x[f"ail_std_{w}h"] = prior_ail.rolling(w).std()
        x[f"wind_mean_{w}h"] = prior_wind.rolling(w).mean()
        x[f"wind_std_{w}h"] = prior_wind.rolling(w).std()

    x["ail_change_1h"] = x.ail_mw.shift(1) - x.ail_mw.shift(2)
    x["wind_change_1h"] = x.wind_mw.shift(1) - x.wind_mw.shift(2)
    x["baseline_last_week"] = x.tight.shift(168)
    return x


def metrics(name, y, pred, score=None):
    return {
        "model": name,
        "precision": float(precision_score(y, pred, zero_division=0)),
        "recall": float(recall_score(y, pred, zero_division=0)),
        "f1": float(f1_score(y, pred, zero_division=0)),
        "prAuc": float(average_precision_score(y, score)) if score is not None else None,
        "warningsSent": int(np.sum(pred)),
        "actualTightHours": int(np.sum(y)),
        "confusion": confusion_matrix(y, pred, labels=[0, 1]).astype(int).tolist(),
    }


def oof_probabilities(model, X, y, n_splits=5):
    splitter = TimeSeriesSplit(n_splits=n_splits)
    p = np.full(len(X), np.nan)
    for tr, va in splitter.split(X):
        m = clone(model)
        m.fit(X.iloc[tr], y.iloc[tr])
        p[va] = m.predict_proba(X.iloc[va])[:, 1]
    return p


def f1_optimal_threshold(y, p):
    valid = ~np.isnan(p)
    yy, pp = np.asarray(y)[valid], p[valid]
    precision, recall, thresholds = precision_recall_curve(yy, pp)
    f1 = 2 * precision[:-1] * recall[:-1] / (precision[:-1] + recall[:-1] + 1e-12)
    i = int(np.nanargmax(f1))
    return float(thresholds[i]), float(f1[i])


def price_stats(series):
    return {
        "count": int(series.count()),
        "mean": float(series.mean()),
        "median": float(series.median()),
        "max": float(series.max()),
    }


def main():
    df = pd.read_csv(CSV_PATH)
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    for c in ["pool_price_cad_per_mwh", "ail_mw", "wind_mw"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = (
        df.dropna(subset=["timestamp"])
        .drop_duplicates("timestamp", keep="last")
        .sort_values("timestamp")
        .reset_index(drop=True)
    )

    test_fraction = 0.20
    split_idx = int(len(df) * (1 - test_fraction))
    split_time = df.iloc[split_idx].timestamp
    train_raw = df.iloc[:split_idx].copy()

    load_q, wind_q = 0.80, 0.20
    load_threshold = float(train_raw.ail_mw.quantile(load_q))
    wind_threshold = float(train_raw.wind_mw.quantile(wind_q))
    df["tight"] = (
        (df.ail_mw >= load_threshold) & (df.wind_mw <= wind_threshold)
    ).astype(int)

    feature_cols = [
        "hour_sin",
        "hour_cos",
        "dow_sin",
        "dow_cos",
        "month",
        "is_weekend",
        *[f"ail_lag_{i}" for i in [1, 2, 3, 6, 12, 24, 48, 168]],
        *[f"wind_lag_{i}" for i in [1, 2, 3, 6, 12, 24, 48, 168]],
        *[f"price_lag_{i}" for i in [1, 24, 168]],
        *[f"ail_mean_{i}h" for i in [6, 24, 72, 168]],
        *[f"ail_std_{i}h" for i in [6, 24, 72, 168]],
        *[f"wind_mean_{i}h" for i in [6, 24, 72, 168]],
        *[f"wind_std_{i}h" for i in [6, 24, 72, 168]],
        "ail_change_1h",
        "wind_change_1h",
    ]

    model_df = add_features(df).dropna(subset=feature_cols + ["baseline_last_week"]).reset_index(drop=True)
    train = model_df[model_df.timestamp < split_time].copy()
    test = model_df[model_df.timestamp >= split_time].copy()
    X_train, y_train = train[feature_cols], train.tight.astype(int)
    X_test, y_test = test[feature_cols], test.tight.astype(int)

    models = {
        "Logistic regression": Pipeline(
            [
                ("impute", SimpleImputer(strategy="median")),
                ("scale", StandardScaler()),
                (
                    "model",
                    LogisticRegression(
                        class_weight="balanced", max_iter=2000, random_state=RANDOM_STATE
                    ),
                ),
            ]
        ),
        "Random forest": Pipeline(
            [
                ("impute", SimpleImputer(strategy="median")),
                (
                    "model",
                    RandomForestClassifier(
                        n_estimators=400,
                        min_samples_leaf=4,
                        class_weight="balanced_subsample",
                        n_jobs=1,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
        "Histogram gradient boosting": Pipeline(
            [
                ("impute", SimpleImputer(strategy="median")),
                (
                    "model",
                    HistGradientBoostingClassifier(
                        learning_rate=0.05,
                        max_iter=300,
                        max_leaf_nodes=31,
                        l2_regularization=1.0,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
    }

    print("Selecting thresholds from training-only time-series validation...")
    thresholds = {}
    cv_f1 = {}
    for name, model in models.items():
        p = oof_probabilities(model, X_train, y_train)
        thresholds[name], cv_f1[name] = f1_optimal_threshold(y_train, p)
        print(f"  {name}: threshold={thresholds[name]:.3f} cv_f1={cv_f1[name]:.3f}")

    baseline_pred = test.baseline_last_week.astype(int).to_numpy()
    results = [metrics("Same hour last week", y_test, baseline_pred)]
    predictions = {"Same hour last week": baseline_pred}
    probabilities = {}
    fitted_models = {}

    print("Fitting held-out models...")
    for name, template in models.items():
        m = clone(template).fit(X_train, y_train)
        p = m.predict_proba(X_test)[:, 1]
        pred = (p >= thresholds[name]).astype(int)
        fitted_models[name] = m
        probabilities[name] = p
        predictions[name] = pred
        row = metrics(name, y_test, pred, p)
        row["threshold"] = thresholds[name]
        row["cvF1"] = cv_f1[name]
        results.append(row)
        print(f"  {name}: f1={row['f1']:.3f}")

    results_sorted = sorted(results, key=lambda r: r["f1"], reverse=True)
    baseline = next(r for r in results if r["model"] == "Same hour last week")
    best = next(r for r in results_sorted if r["model"] != "Same hour last week")
    best_name = best["model"]

    print(f"Permutation importance for {best_name}...")
    perm = permutation_importance(
        fitted_models[best_name],
        X_test,
        y_test,
        scoring="average_precision",
        n_repeats=10,
        random_state=RANDOM_STATE,
        n_jobs=1,
    )
    order = np.argsort(perm.importances_mean)[::-1][:12]
    importance = [
        {
            "feature": feature_cols[i],
            "mean": float(perm.importances_mean[i]),
            "std": float(perm.importances_std[i]),
        }
        for i in order
    ]

    alt_load_q, alt_wind_q = 0.85, 0.15
    alt_load_threshold = float(train_raw.ail_mw.quantile(alt_load_q))
    alt_wind_threshold = float(train_raw.wind_mw.quantile(alt_wind_q))
    alt = model_df.copy()
    alt["tight_alt"] = (
        (alt.ail_mw >= alt_load_threshold) & (alt.wind_mw <= alt_wind_threshold)
    ).astype(int)
    train_alt = alt[alt.timestamp < split_time]
    test_alt = alt[alt.timestamp >= split_time]
    X_train_alt, y_train_alt = train_alt[feature_cols], train_alt.tight_alt
    X_test_alt, y_test_alt = test_alt[feature_cols], test_alt.tight_alt
    template = models[best_name]
    alt_oof = oof_probabilities(template, X_train_alt, y_train_alt)
    alt_threshold, alt_cv = f1_optimal_threshold(y_train_alt, alt_oof)
    alt_model = clone(template).fit(X_train_alt, y_train_alt)
    alt_prob = alt_model.predict_proba(X_test_alt)[:, 1]
    alt_pred = (alt_prob >= alt_threshold).astype(int)

    original_warnings = int(predictions[best_name].sum())
    changed_warnings = int(alt_pred.sum())

    timeline = test[["timestamp", "tight", "pool_price_cad_per_mwh"]].copy()
    timeline["warning"] = predictions[best_name]
    timeline["probability"] = probabilities[best_name]
    timeline["date"] = timeline.timestamp.dt.strftime("%Y-%m-%d")
    daily = (
        timeline.groupby("date", as_index=False)
        .agg(tight=("tight", "sum"), warnings=("warning", "sum"), meanProb=("probability", "mean"))
        .tail(60)
    )

    by_hour = (
        test.assign(hour=test.timestamp.dt.hour)
        .groupby("hour")
        .agg(tight=("tight", "sum"), hours=("tight", "size"))
        .reset_index()
    )

    price = test.groupby("tight").pool_price_cad_per_mwh
    payload = {
        "source": "aeso_hourly_2024.csv",
        "method": "Notebook pipeline: chronological 80/20 split, training-only cutoffs, leakage-safe lags.",
        "dataset": {
            "rows": int(len(df)),
            "start": df.timestamp.min().strftime("%Y-%m-%d %H:%M"),
            "end": df.timestamp.max().strftime("%Y-%m-%d %H:%M"),
            "trainRows": int(len(train)),
            "testRows": int(len(test)),
            "splitTime": split_time.strftime("%Y-%m-%d %H:%M"),
            "features": len(feature_cols),
        },
        "definition": {
            "loadCutoffMw": load_threshold,
            "windCutoffMw": wind_threshold,
            "trainTightRate": float(df.iloc[:split_idx].tight.mean()),
            "testTightRate": float(df.iloc[split_idx:].tight.mean()),
        },
        "models": results_sorted,
        "bestModel": best_name,
        "baselineF1": baseline["f1"],
        "bestF1": best["f1"],
        "f1Lift": float(best["f1"] - baseline["f1"]),
        "beatsBaseline": bool(best["f1"] > baseline["f1"]),
        "importance": importance,
        "sensitivity": [
            {
                "definition": "Original Q80 load and Q20 wind",
                "loadCutoffMw": load_threshold,
                "windCutoffMw": wind_threshold,
                "actualTightTest": int(y_test.sum()),
                "warningsSentTest": original_warnings,
                "precision": best["precision"],
                "recall": best["recall"],
                "f1": best["f1"],
            },
            {
                "definition": "Stricter Q85 load and Q15 wind",
                "loadCutoffMw": alt_load_threshold,
                "windCutoffMw": alt_wind_threshold,
                "actualTightTest": int(y_test_alt.sum()),
                "warningsSentTest": changed_warnings,
                "precision": float(precision_score(y_test_alt, alt_pred, zero_division=0)),
                "recall": float(recall_score(y_test_alt, alt_pred, zero_division=0)),
                "f1": float(f1_score(y_test_alt, alt_pred, zero_division=0)),
                "threshold": alt_threshold,
                "cvF1": alt_cv,
            },
        ],
        "warningChange": changed_warnings - original_warnings,
        "prices": {
            "notTight": price_stats(test.loc[test.tight == 0, "pool_price_cad_per_mwh"]),
            "tight": price_stats(test.loc[test.tight == 1, "pool_price_cad_per_mwh"]),
        },
        "byHour": [
            {"hour": int(r.hour), "tight": int(r.tight), "hours": int(r.hours)}
            for r in by_hour.itertuples(index=False)
        ],
        "daily": [
            {
                "date": r.date,
                "tight": int(r.tight),
                "warnings": int(r.warnings),
                "meanProb": float(r.meanProb),
            }
            for r in daily.itertuples(index=False)
        ],
    }

    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(
        f"Best {best_name} F1={best['f1']:.3f} vs baseline {baseline['f1']:.3f} "
        f"(lift {best['f1'] - baseline['f1']:+.3f})"
    )


if __name__ == "__main__":
    main()
