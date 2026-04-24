from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logging_conf import configure as configure_logging, log

configure_logging()

app = FastAPI(title="Agora API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


from app.routers import session as session_router  # noqa: E402
from app.routers import company as company_router  # noqa: E402
from app.routers import employees as employees_router  # noqa: E402
from app.routers import okrs as okrs_router  # noqa: E402
from app.routers import interviews as interviews_router  # noqa: E402
from app.routers import webhooks as webhooks_router  # noqa: E402
from app.routers import dashboard as dashboard_router  # noqa: E402
from app.routers import chat as chat_router  # noqa: E402
from app.routers import research as research_router  # noqa: E402
from app.routers import integrations as integrations_router  # noqa: E402
from app.routers import review as review_router  # noqa: E402
from app.routers import alerts as alerts_router  # noqa: E402

app.include_router(session_router.router)
app.include_router(company_router.router)
app.include_router(employees_router.router)
app.include_router(okrs_router.router)
app.include_router(interviews_router.router)
app.include_router(webhooks_router.router)
app.include_router(dashboard_router.router)
app.include_router(chat_router.router)
app.include_router(research_router.router)
app.include_router(integrations_router.router)
app.include_router(review_router.router)
app.include_router(alerts_router.router)


@app.on_event("startup")
def _startup() -> None:
    from app.scheduler import start_scheduler

    start_scheduler()
    log.info("api_startup")
