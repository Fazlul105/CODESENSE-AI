import pytest
from fastapi.testclient import TestClient
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["model_loaded"] is True
    assert "model_name" in data

def test_metrics_endpoint():
    response = client.get("/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "benchmark_comparison" in data
    assert "best_model" in data

def test_predict_low_risk_pr():
    payload = {
        "lines_added": 12,
        "lines_deleted": 4,
        "files_changed": 1,
        "entropy": 0.1,
        "is_bugfix": 0,
        "file_types_count": 1,
        "static_critical_findings": 0,
        "static_high_findings": 0,
        "static_medium_findings": 0
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "defect_probability" in data
    assert data["defect_probability"] < 0.50
    assert data["risk_level"] in ["low", "medium"]
    assert len(data["top_contributing_features"]) > 0

def test_predict_high_risk_pr():
    payload = {
        "lines_added": 1200,
        "lines_deleted": 450,
        "files_changed": 18,
        "entropy": 0.95,
        "is_bugfix": 1,
        "file_types_count": 4,
        "static_critical_findings": 3,
        "static_high_findings": 5,
        "static_medium_findings": 8
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "defect_probability" in data
    assert data["defect_probability"] > 0.50
    assert data["risk_level"] in ["high", "critical"]
    assert data["is_defect_prone"] is True

def test_validation_error_on_invalid_input():
    payload = {
        "lines_added": -50, # invalid negative number
        "lines_deleted": 0,
        "files_changed": 0  # must be ge=1
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 422 # Unprocessable Entity
