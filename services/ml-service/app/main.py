import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models.schemas import ChangeFeatures, DefectRiskPrediction
from .inference.predictor import predictor_instance

app = FastAPI(
    title="CodeSense AI — ML Defect Risk Inference Service",
    description="Supervised defect-risk estimation microservice for code changes and pull requests",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "codesense-ml-service",
        "model_loaded": predictor_instance.is_loaded,
        "model_name": predictor_instance.model_name,
        "model_version": predictor_instance.model_version
    }

@app.get("/metrics")
def get_metrics_summary():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    summary_path = os.path.join(base_dir, 'artifacts', 'metrics_summary.json')
    if not os.path.exists(summary_path):
        raise HTTPException(status_code=404, detail="Metrics summary not found")
    with open(summary_path, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.post("/predict", response_model=DefectRiskPrediction)
def predict_defect_risk(features: ChangeFeatures):
    try:
        return predictor_instance.predict(features)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
