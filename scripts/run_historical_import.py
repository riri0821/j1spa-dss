"""Run the one-time historical import (paper 3.2). Reads the legacy files in
data/historical/ and loads them into the operational catalog + the warehouse.

    python scripts/run_historical_import.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.etl import historical_import  # noqa: E402

if __name__ == "__main__":
    res = historical_import.run(trigger_source="deployment")
    print("Historical import complete:")
    for k, v in res.items():
        print(f"  {k:10}: {v}")
