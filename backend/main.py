from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import locations  # You can import more routers here later

app = FastAPI()

# CORS settings — allow frontend to call APIs
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://brave-mud-0dbaa4d03.2.azurestaticapps.net"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static frontend files
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

# Include API routers (modular)
app.include_router(locations.router, prefix="/api")
