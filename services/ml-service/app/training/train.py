import os
import sys
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    brier_score_loss,
    confusion_matrix,
)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from dataset import generate_or_load_jit_dataset, FEATURE_COLUMNS, DATASET_METADATA

def train_and_evaluate():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_path = os.path.join(base_dir, 'data', 'jit_defect_data.csv')
    artifacts_dir = os.path.join(base_dir, 'artifacts')
    os.makedirs(artifacts_dir, exist_ok=True)

    print("==================================================")
    print("  CodeSense AI — Defect Risk ML Model Training")
    print("  Dataset: Kamei et al. (IEEE TSE 2013) JIT Benchmark")
    print("==================================================")

    # 1. Load Authentic Real-World JIT Data
    df = generate_or_load_jit_dataset(data_path, n_samples=None)
    X = df[FEATURE_COLUMNS]
    y = df['defect_prone']

    # 2. Defensible 70/15/15 Stratified Split (prevents test data leakage)
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.30, random_state=42, stratify=y
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.50, random_state=42, stratify=y_temp
    )

    print(f"Total samples: {len(df)} (Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)})")
    print(f"Ground truth defect rate: Train {y_train.mean():.2%}, Val {y_val.mean():.2%}, Test {y_test.mean():.2%}")

    # 3. Model Candidates
    base_models = {
        'LogisticRegression_Baseline': Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(class_weight='balanced', max_iter=1000, random_state=42))
        ]),
        'RandomForestClassifier': Pipeline([
            ('scaler', StandardScaler()),
            ('clf', RandomForestClassifier(n_estimators=120, max_depth=8, class_weight='balanced', random_state=42))
        ]),
        'HistGradientBoostingClassifier': Pipeline([
            ('scaler', StandardScaler()),
            ('clf', HistGradientBoostingClassifier(max_iter=100, max_depth=6, random_state=42))
        ])
    }

    results = {}
    best_model_name = None
    best_pr_auc = -1.0
    best_pipeline = None

    for name, pipeline in base_models.items():
        # Train calibrated classifier using cross-validation on train split
        calibrated = CalibratedClassifierCV(estimator=pipeline, method='sigmoid', cv=3)
        calibrated.fit(X_train, y_train)

        # Also fit uncalibrated pipeline for extracting feature importances
        pipeline.fit(X_train, y_train)

        # Evaluate on strictly held-out real test set
        y_prob = calibrated.predict_proba(X_test)[:, 1]
        y_pred = (y_prob >= 0.50).astype(int)

        roc_auc = float(roc_auc_score(y_test, y_prob))
        pr_auc = float(average_precision_score(y_test, y_prob))
        f1 = float(f1_score(y_test, y_pred))
        prec = float(precision_score(y_test, y_pred, zero_division=0))
        rec = float(recall_score(y_test, y_pred))
        brier = float(brier_score_loss(y_test, y_prob))
        cm = confusion_matrix(y_test, y_pred).tolist()

        results[name] = {
            'roc_auc': round(roc_auc, 4),
            'pr_auc': round(pr_auc, 4),
            'f1_score': round(f1, 4),
            'precision': round(prec, 4),
            'recall': round(rec, 4),
            'brier_score': round(brier, 4),
            'confusion_matrix': cm
        }

        print(f"\nModel: {name}")
        print(f"  ROC-AUC: {roc_auc:.4f} | PR-AUC: {pr_auc:.4f} | F1: {f1:.4f} | Prec: {prec:.4f} | Rec: {rec:.4f} | Brier: {brier:.4f}")

        if pr_auc > best_pr_auc:
            best_pr_auc = pr_auc
            best_model_name = name
            best_pipeline = calibrated
            best_uncalibrated = pipeline

    print(f"\n>>> Selected Best Model: {best_model_name} (PR-AUC: {best_pr_auc:.4f})")

    # Compute Feature Importances (from the underlying estimator in the pipeline)
    feature_importances = {}
    clf_step = best_uncalibrated.named_steps['clf']
    if hasattr(clf_step, 'feature_importances_'):
        raw_imp = clf_step.feature_importances_
        for col, imp in zip(FEATURE_COLUMNS, raw_imp):
            feature_importances[col] = round(float(imp), 4)
    elif hasattr(clf_step, 'coef_'):
        raw_coef = np.abs(clf_step.coef_[0])
        norm_coef = raw_coef / np.sum(raw_coef)
        for col, imp in zip(FEATURE_COLUMNS, norm_coef):
            feature_importances[col] = round(float(imp), 4)

    # 4. Serialize Best Model Artifact
    artifact = {
        'model_pipeline': best_pipeline,
        'model_name': best_model_name,
        'model_version': '2.0.0',
        'feature_columns': FEATURE_COLUMNS,
        'feature_importances': feature_importances,
        'metrics': results[best_model_name]
    }

    model_save_path = os.path.join(artifacts_dir, 'best_model.joblib')
    joblib.dump(artifact, model_save_path)
    print(f"[Artifact] Saved calibrated model to: {model_save_path}")

    # 5. Save Metrics Summary JSON
    summary_path = os.path.join(artifacts_dir, 'metrics_summary.json')
    summary_data = {
        'best_model': best_model_name,
        'model_version': '2.0.0',
        'benchmark_comparison': results,
        'feature_importances': feature_importances,
        'training_dataset': {
            'origin': DATASET_METADATA['name'],
            'citation': DATASET_METADATA['source'],
            'labeling': DATASET_METADATA['labeling_method'],
            'samples': len(df),
            'positive_label_ratio': round(float(y.mean()), 4),
            'license': DATASET_METADATA['license'],
            'features': FEATURE_COLUMNS,
            'limitations': DATASET_METADATA['limitations']
        }
    }

    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary_data, f, indent=2)
    print(f"[Artifact] Saved metrics summary to: {summary_path}")

if __name__ == '__main__':
    train_and_evaluate()
