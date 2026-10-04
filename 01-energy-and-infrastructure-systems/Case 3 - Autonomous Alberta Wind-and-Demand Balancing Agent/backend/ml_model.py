import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.model_selection import TimeSeriesSplit
from sklearn.inspection import permutation_importance
from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix
import warnings
warnings.filterwarnings('ignore')


def load_and_validate_data(csv_path):
    """Load CSV and validate structure."""
    df = pd.read_csv(csv_path)
    df = df.rename(columns={
        'timestamp': 'datetime',
        'ail_mw': 'AIL',
        'wind_mw': 'Wind',
        'pool_price_cad_per_mwh': 'price'
    })
    df['datetime'] = pd.to_datetime(df['datetime'])
    df = df.sort_values('datetime').reset_index(drop=True)
    return df


def load_capacity_data(capacity_csv_path):
    """Load capacity and dispatch reserve data."""
    try:
        capacity_df = pd.read_csv(capacity_csv_path)
        return capacity_df.to_dict('records')
    except Exception as e:
        print(f"Warning: Could not load capacity data: {e}")
        return []


def define_tight_hours(df, ail_percentile=80, wind_percentile=20):
    """Define tight hours based on AIL and Wind thresholds."""
    ail_threshold = df['AIL'].quantile(ail_percentile / 100)
    wind_threshold = df['Wind'].quantile(wind_percentile / 100)
    
    df['is_tight_hour'] = (
        (df['AIL'] >= ail_threshold) & 
        (df['Wind'] <= wind_threshold)
    ).astype(int)
    
    return df, {
        'ail_threshold': float(ail_threshold),
        'wind_threshold': float(wind_threshold),
        'ail_percentile': ail_percentile,
        'wind_percentile': wind_percentile,
        'count': int(df['is_tight_hour'].sum()),
        'percentage': float(df['is_tight_hour'].mean() * 100)
    }


def add_features(df):
    """Add calendar and lag features."""
    df = df.copy()
    df['hour'] = df['datetime'].dt.hour
    df['day_of_week'] = df['datetime'].dt.dayofweek
    df['month'] = df['datetime'].dt.month
    
    # Cyclical encoding
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['dow_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['dow_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    
    # Lags
    for lag in [1, 24, 168]:
        df[f'AIL_lag_{lag}'] = df['AIL'].shift(lag)
        df[f'Wind_lag_{lag}'] = df['Wind'].shift(lag)
    
    # Rolling statistics
    for window in [6, 24, 168]:
        df[f'AIL_roll_mean_{window}'] = df['AIL'].rolling(window).mean()
        df[f'Wind_roll_mean_{window}'] = df['Wind'].rolling(window).mean()
        df[f'AIL_roll_std_{window}'] = df['AIL'].rolling(window).std()
    
    # Ramps
    df['AIL_ramp'] = df['AIL'].diff()
    df['Wind_ramp'] = df['Wind'].diff()
    
    # Drop NaNs from lags/rolling
    df = df.dropna().reset_index(drop=True)
    return df


def build_models(X_train, y_train, X_test, y_test):
    """Train 3 models and return results."""
    models = {
        'Logistic Regression': LogisticRegression(max_iter=1000, random_state=42),
        'Random Forest': RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
        'Histogram Gradient Boosting': HistGradientBoostingClassifier(random_state=42)
    }
    
    results = {}
    for name, model in models.items():
        model.fit(X_train, y_train)
        y_pred_proba = model.predict_proba(X_test)[:, 1]
        
        # F1-optimal threshold
        best_f1 = 0
        best_threshold = 0.5
        for threshold in np.arange(0.1, 0.9, 0.05):
            y_pred_thresholded = (y_pred_proba >= threshold).astype(int)
            f1 = f1_score(y_test, y_pred_thresholded, zero_division=0)
            if f1 > best_f1:
                best_f1 = f1
                best_threshold = threshold
        
        y_pred = (y_pred_proba >= best_threshold).astype(int)
        
        results[name] = {
            'model': model,
            'y_pred_proba': y_pred_proba,
            'y_pred': y_pred,
            'threshold': best_threshold,
            'precision': float(precision_score(y_test, y_pred, zero_division=0)),
            'recall': float(recall_score(y_test, y_pred, zero_division=0)),
            'f1': float(f1_score(y_test, y_pred, zero_division=0))
        }
    
    return results


def generate_dispatch_recommendations(capacity_data, total_needed_reserve_mw=400):
    """
    Generate dispatch resource recommendations.
    
    Prioritize resources by:
    1. Dispatch contingency reserve available
    2. Unused capacity (MaximumCapacity - TotalNetGeneration)
    3. Total reserve capability
    
    Args:
        capacity_data: List of dicts with GROUP, MaximumCapacity, TotalNetGeneration, DispatchContigencyReserve
        total_needed_reserve_mw: How much reserve capacity is needed for tight hours
    
    Returns:
        List of recommended resource groups with details
    """
    if not capacity_data:
        return []
    
    recommendations = []
    total_reserve_available = 0
    
    for resource in capacity_data:
        group = resource.get('GROUP', '')
        max_capacity = float(resource.get('MaximumCapacity', 0))
        current_generation = float(resource.get('TotalNetGeneration', 0))
        dispatch_reserve = float(resource.get('DispatchContigencyReserve', 0))
        
        unused_capacity = max_capacity - current_generation
        
        recommendations.append({
            'group': group,
            'max_capacity_mw': max_capacity,
            'current_generation_mw': current_generation,
            'unused_capacity_mw': unused_capacity,
            'dispatch_reserve_mw': dispatch_reserve,
            'priority_score': dispatch_reserve + (unused_capacity * 0.5)  # Weighted priority
        })
        
        total_reserve_available += dispatch_reserve
    
    # Sort by priority score (highest first)
    recommendations.sort(key=lambda x: x['priority_score'], reverse=True)
    
    # Identify which resources to dispatch
    accumulated_reserve = 0
    dispatch_plan = []
    
    for rec in recommendations:
        if accumulated_reserve >= total_needed_reserve_mw:
            break
        
        # Only recommend if it doesn't exceed max capacity
        if rec['unused_capacity_mw'] > 0:
            recommend_mw = min(rec['dispatch_reserve_mw'], rec['unused_capacity_mw'])
            dispatch_plan.append({
                'group': str(rec['group']),
                'priority': int(len(dispatch_plan) + 1),
                'recommend_dispatch_mw': float(recommend_mw),
                'reason': f"Dispatch reserve available: {rec['dispatch_reserve_mw']:.0f} MW, Unused capacity: {rec['unused_capacity_mw']:.0f} MW",
                'max_capacity_mw': float(rec['max_capacity_mw'])
            })
            accumulated_reserve += rec['dispatch_reserve_mw']
    
    return {
        'recommendations': dispatch_plan,
        'total_reserve_available_mw': float(total_reserve_available),
        'reserve_needed_mw': int(total_needed_reserve_mw)
    }


def get_feature_importance(model, X_test, y_test, feature_names):
    """Get top features using permutation importance."""
    perm_importance = permutation_importance(
        model, X_test, y_test, n_repeats=10, random_state=42, n_jobs=-1
    )
    
    importance_df = pd.DataFrame({
        'feature': feature_names,
        'importance': perm_importance.importances_mean
    }).sort_values('importance', ascending=False)
    
    # Convert to pure Python types (not numpy)
    result = []
    for _, row in importance_df.head(15).iterrows():
        result.append({
            'feature': str(row['feature']),
            'importance': float(row['importance'])
        })
    return result


def run_ml_pipeline(csv_path):
    """Main pipeline: load data, train models, return results."""
    # Load data
    df = load_and_validate_data(csv_path)
    
    # Define tight hours
    df, tight_def = define_tight_hours(df)
    
    # Add features
    df = add_features(df)
    
    # Prepare train/test (80-20 time-series split)
    split_idx = int(len(df) * 0.8)
    X = df.drop(['datetime', 'is_tight_hour', 'AIL', 'Wind'], axis=1)
    y = df['is_tight_hour']
    
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    
    # Train models
    model_results = build_models(X_train, y_train, X_test, y_test)
    
    # Get best model (by F1)
    best_model_name = max(model_results, key=lambda x: model_results[x]['f1'])
    best_model = model_results[best_model_name]['model']
    
    # Feature importance
    feature_importance = get_feature_importance(
        best_model, X_test, y_test, X.columns.tolist()
    )
    
    # Confusion matrix
    y_pred_best = model_results[best_model_name]['y_pred']
    cm = confusion_matrix(y_test, y_pred_best)
    
    # Get tight hour records (convert datetime to string for JSON serialization)
    tight_hours_subset = df[df['is_tight_hour'] == 1][['datetime', 'AIL', 'Wind']].copy()
    tight_hours_subset['datetime'] = tight_hours_subset['datetime'].astype(str)
    tight_hours_records = [
        {k: float(v) if k in ['AIL', 'Wind'] else str(v) for k, v in row.items()}
        for row in tight_hours_subset.to_dict('records')
    ]
    
    # ===== NEW: Week-over-week and held-out analysis =====
    # Get test set data
    test_df = df.iloc[-len(X_test):].copy()
    test_df['y_true'] = y_test.values
    test_df['y_pred'] = model_results[best_model_name]['y_pred']
    
    # Define "held-out week" as last 7 days of test set
    test_df['datetime'] = pd.to_datetime(test_df['datetime'])
    latest_date = test_df['datetime'].max()
    week_ago = latest_date - pd.Timedelta(days=7)
    held_out_week = test_df[test_df['datetime'] >= week_ago].copy()
    
    # Week-over-week comparison (same clock hour, 7 days apart)
    week_over_week_data = []
    if len(held_out_week) > 0 and len(test_df) > 7 * 24:
        for idx, row in held_out_week.iterrows():
            current_hour = row['datetime']
            last_week_hour = current_hour - pd.Timedelta(days=7)
            last_week_row = test_df[test_df['datetime'] == last_week_hour]
            
            if len(last_week_row) > 0:
                week_over_week_data.append({
                    'datetime': str(row['datetime']),
                    'current_tight': int(row['y_true']),
                    'last_week_tight': int(last_week_row.iloc[0]['y_true']),
                    'current_ail': float(row['AIL']),
                    'last_week_ail': float(last_week_row.iloc[0]['AIL'])
                })
    
    # Hit/miss/false alarm counts
    cm = confusion_matrix(y_test, model_results[best_model_name]['y_pred'])
    tn, fp, fn, tp = cm[0,0], cm[0,1], cm[1,0], cm[1,1]
    
    # Load capacity data and generate dispatch recommendations
    capacity_path = csv_path.replace('aeso_hourly_2024.csv', 'CapacityMW.csv')
    capacity_data = load_capacity_data(capacity_path)
    dispatch_recommendations = generate_dispatch_recommendations(capacity_data, total_needed_reserve_mw=400)
    
    return {
        'data_info': {
            'total_rows': len(df),
            'total_columns': len(X.columns),
            'date_range': f"{str(df['datetime'].min())} to {str(df['datetime'].max())}",
            'train_size': len(X_train),
            'test_size': len(X_test)
        },
        'tight_definition': tight_def,
        'tight_definition_oneliner': f"AIL in top {tight_def['ail_percentile']}% AND Wind in bottom {tight_def['wind_percentile']}%",
        'tight_hours': [
            {
                'datetime': str(rec['datetime']),
                'AIL': float(rec['AIL']),
                'Wind': float(rec['Wind'])
            }
            for rec in tight_hours_records
        ],
        'held_out_week': {
            'count': len(held_out_week),
            'tight_hours': int(held_out_week['y_true'].sum()) if len(held_out_week) > 0 else 0,
            'data': [
                {
                    'datetime': str(row['datetime']),
                    'is_tight': int(row['y_true']),
                    'ail': float(row['AIL']),
                    'wind': float(row['Wind'])
                }
                for _, row in held_out_week.iterrows()
            ]
        },
        'week_over_week': week_over_week_data,
        'model_performance': {
            'hits': int(tp),
            'misses': int(fn),
            'false_alarms': int(fp),
            'correct_negatives': int(tn),
            'accuracy': float((tp + tn) / (tp + tn + fp + fn)) if (tp + tn + fp + fn) > 0 else 0
        },
        'dispatch_recommendations': dispatch_recommendations,
        'model_results': [
            {
                'name': name,
                'precision': results['precision'],
                'recall': results['recall'],
                'f1': results['f1'],
                'threshold': results['threshold'],
                'is_best': name == best_model_name
            }
            for name, results in model_results.items()
        ],
        'confusion_matrix': {
            'true_negatives': int(cm[0, 0]),
            'false_positives': int(cm[0, 1]),
            'false_negatives': int(cm[1, 0]),
            'true_positives': int(cm[1, 1])
        },
        'feature_importance': feature_importance
    }
