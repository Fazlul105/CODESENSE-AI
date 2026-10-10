from pydantic import BaseModel, Field
from typing import List, Optional, Dict

class ChangeFeatures(BaseModel):
    lines_added: int = Field(ge=0, description="Total lines of code added in pull request")
    lines_deleted: int = Field(ge=0, description="Total lines of code deleted in pull request")
    files_changed: int = Field(ge=1, description="Number of modified files")
    entropy: float = Field(ge=0.0, le=1.0, default=0.5, description="Spread/diffusion of changes across files (0=concentrated, 1=dispersed)")
    is_bugfix: int = Field(ge=0, le=1, default=0, description="1 if PR title or commit message mentions a bug fix, 0 otherwise")
    file_types_count: int = Field(ge=1, default=1, description="Number of distinct file extensions modified")
    static_critical_findings: int = Field(ge=0, default=0, description="Critical static analysis findings count")
    static_high_findings: int = Field(ge=0, default=0, description="High static analysis findings count")
    static_medium_findings: int = Field(ge=0, default=0, description="Medium static analysis findings count")

class FeatureContribution(BaseModel):
    feature: str
    impact: str
    importance: float

class EvaluationMetrics(BaseModel):
    roc_auc: float
    pr_auc: float
    f1_score: float
    precision: float
    recall: float

class DefectRiskPrediction(BaseModel):
    model_version: str
    model_type: str
    defect_probability: float
    risk_level: str  # "low", "medium", "high", "critical"
    is_defect_prone: bool
    confidence: float
    top_contributing_features: List[FeatureContribution]
    evaluation_metrics_summary: Optional[EvaluationMetrics] = None
    note: str
