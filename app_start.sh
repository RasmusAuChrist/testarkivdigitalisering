#!/bin/bash

# Go to the deployed directory (important!)
cd /home/site/wwwroot

# Install dependencies manually
pip install -r backend/requirements.txt

# Start FastAPI with uvicorn
Cd backend
python -m uvicorn main:app --host=0.0.0.0 --port=8000
