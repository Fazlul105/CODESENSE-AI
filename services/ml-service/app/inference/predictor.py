import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List
from ..models.schemas import (
    ChangeFeatures,
    DefectRiskPrediction,
    FeatureContribution,
    EvaluationMetrics
)

class DefectRiskPredictor:
    def __init__(self, artifact_path: str = None):
        if artifact_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            artifact_path = os.path.join(base_dir, 'artifacts', 'best_model.joblib')

        self.artifact_path = artifact_path
        self.is_loaded = False
        self.model_pipeline = None
        self.model_name = "Unknown"
        self.model_version = "1.0.0"
        self.feature_columns: List[str] = []
        self.feature_importances: Dict[str, float] = {}
        self.metrics: Dict[str, Any] = {}

        self._load()

    def _load(self):
        if not os.path.exists(self.artifact_path):
            raise FileNotFoundError(f"Model artifact not found at {self.artifact_path}. Run train.py first.")

        data = joblib.load(self.artifact_path)
        self.model_pipeline = data['model_pipeline']
        self.model_name = data.get('model_name', 'Trained Defect Model')
        self.model_version = data.get('model_version', '1.0.0')
        self.feature_columns = data.get('feature_columns', [])
        self.feature_importances = data.get('feature_importances', {})
        self.metrics = data.get('metrics', {})
        self.is_loaded = True

    def predict(self, features: ChangeFeatures) -> DefectRiskPrediction:
        if not self.is_loaded:
            self._load()

        # Convert to DataFrame matching training schema
        df = pd.DataFrame([[
            features.lines_added,
            features.lines_deleted,
            features.files_changed,
            features.entropy,
            features.is_bugfix,
            features.file_types_count,
            features.static_critical_findings,
            features.static_high_findings,
            features.static_medium_findings
        ]], columns=self.feature_columns)

        # Predict probability of defect_prone (class 1)
        probs = self.model_pipeline.predict_proba(df)[0]
        prob_defect = float(probs[1])

        # Risk categorization with defensible calibrated boundaries
        if prob_defect >= 0.70:
            risk_level = "critical"
        elif prob_defect >= 0.45:
            risk_level = "high"
        elif prob_defect >= 0.25:
            risk_level = "medium"
        else:
            risk_level = "low"

        is_defect_prone = prob_defect >= 0.50
        confidence = float(max(probs[0], probs[1]))

        # Calculate top contributing features for explainability
        contributions: List[FeatureContribution] = []
        for feat_name, imp in sorted(self.feature_importances.items(), key=lambda x: x[1], reverse=True)[:4]:
            val = getattr(features, feat_name, None)
            contributions.append(FeatureContribution(
                feature=feat_name,
                impact=f"Value: {val} (Weight: {imp})",
                importance=imp
            ))

        eval_summary = None
        if self.metrics:
            eval_summary = EvaluationMetrics(
                roc_auc=self.metrics.get('roc_auc', 0.0),
                pr_auc=self.metrics.get('pr_auc', 0.0),
                f1_score=self.metrics.get('f1_score', 0.0),
                precision=self.metrics.get('precision', 0.0),
                recall=self.metrics.get('recall', 0.0)
            )

        note = (
            f"Evaluated with {self.model_name} (v{self.model_version}) on JIT defect features. "
            "Model outputs estimated probability that the change introduces a regression requiring post-merge fix."
        )

        return DefectRiskPrediction(
            model_version=self.model_version,
            model_type=self.model_name,
            defect_probability=round(prob_defect, 4),
            risk_level=risk_level,
            is_defect_prone=is_defect_prone,
            confidence=round(confidence, 4),
            top_contributing_features=contributions,
            evaluation_metrics_summary=eval_summary,
            note=note
        )

predictor_instance = DefectRiskPredictor()
