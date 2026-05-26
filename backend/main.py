from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import locations, status, scatter_data, dashboard, validation_status, arkiv_overview, serie_hierarchy, auth, workflow, account, admin, arkiv_details, serie_insights, archive_insights, order_degree
from routers.auth import get_current_user

app = FastAPI()
protected_api = [Depends(get_current_user)]

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
app.include_router(locations.router, prefix="/api", dependencies=protected_api)
app.include_router(status.router, prefix="/api", dependencies=protected_api)
app.include_router(scatter_data.router, prefix="/api", dependencies=protected_api)
app.include_router(dashboard.router, prefix="/api", dependencies=protected_api)
app.include_router(validation_status.router, prefix="/api", dependencies=protected_api)
app.include_router(arkiv_overview.router, prefix="/api", dependencies=protected_api)
app.include_router(arkiv_details.router, prefix="/api", dependencies=protected_api)
app.include_router(serie_hierarchy.router, prefix="/api", dependencies=protected_api)
app.include_router(auth.router, prefix="/api")
app.include_router(workflow.router, prefix="/api", dependencies=protected_api)
app.include_router(admin.router, prefix="/api", dependencies=protected_api)
app.include_router(account.router, prefix="/api", dependencies=protected_api)
app.include_router(serie_insights.router, prefix="/api", dependencies=protected_api)
app.include_router(archive_insights.router, prefix="/api", dependencies=protected_api)
app.include_router(order_degree.router, prefix="/api", dependencies=protected_api)

@app.get("/debug/routes")
def debug_routes(_me=Depends(get_current_user)):
    return [route.path for route in app.routes]

# ✅ Static files LAST
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
