from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from ml_model import run_ml_pipeline
import os
import sys
import traceback
import json

app = FastAPI()

# Unbuffer Python output for better logging
sys.stdout = open(sys.stdout.fileno(), mode='w', buffering=1, encoding='utf8')
sys.stderr = open(sys.stderr.fileno(), mode='w', buffering=1, encoding='utf8')

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# CSV path (relative to backend directory)
CSV_PATH = "../data/aeso_hourly_2024.csv"
API_PORT = 8000


@app.get("/")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "message": f"Backend is running on port {API_PORT}"}


@app.get("/api/model-results")
async def get_model_results():
    """Run ML pipeline and return results."""
    try:
        print(f"[API] Starting model results request", flush=True)
        
        if not os.path.exists(CSV_PATH):
            return JSONResponse({"error": f"CSV not found at {CSV_PATH}"})
        
        print(f"[API] Loading data from {CSV_PATH}", flush=True)
        results = run_ml_pipeline(CSV_PATH)
        print(f"[API] Pipeline completed, encoding results...", flush=True)
        
        # Return as JSONResponse explicitly
        return JSONResponse(content=results)
    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"[API] ERROR: {error_msg}", flush=True)
        print(f"[API] Traceback:\n{traceback.format_exc()}", flush=True)
        return JSONResponse(
            status_code=500,
            content={"error": error_msg}
        )
