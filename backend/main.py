from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import locations, status

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://brave-mud-0dbaa4d03.2.azurestaticapps.net"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print(">>> FASTAPI MAIN.PY STARTED <<<")

# ✅ API routes FIRST
app.include_router(locations.router, prefix="/api")
app.include_router(status.router, prefix="/api")

@app.get("/debug/routes")
def debug_routes():
    return [route.path for route in app.routes]

# ✅ Static files LAST
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
