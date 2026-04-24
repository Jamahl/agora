from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from app.clients.openai_client import structured
from app.logging_conf import log
from app.models import Company, Insight, Theme


class _Label(BaseModel):
    label: str
    summary: str


LABEL_SYSTEM = (
    "Given a cluster of related employee-interview insights, "
    "produce a short theme label (<=6 words) and a 1-2 sentence summary of what ties them together."
)


def cluster_themes(db: Session, company_id: int) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = list(
        db.execute(
            select(Insight)
            .where(
                Insight.company_id == company_id,
                Insight.created_at >= cutoff,
                Insight.review_state == "live",
                Insight.embedding.is_not(None),
            )
        ).scalars()
    )
    if len(rows) < 5:
        return 0

    try:
        import hdbscan
        import numpy as np
    except Exception as e:
        log.warning("hdbscan_missing", err=str(e))
        return 0

    X = np.array([r.embedding for r in rows], dtype=np.float32)
    clusterer = hdbscan.HDBSCAN(min_cluster_size=3, metric="euclidean")
    labels = clusterer.fit_predict(X)

    db.execute(delete(Theme).where(Theme.company_id == company_id))
    db.commit()

    count = 0
    for cluster_id in set(labels):
        if cluster_id == -1:
            continue
        members = [r for r, l in zip(rows, labels) if l == cluster_id]
        if len(members) < 3:
            continue
        sample = "\n".join(f"- [{m.type}] {m.content}" for m in members[:12])
        try:
            lbl = structured(
                [
                    {"role": "system", "content": LABEL_SYSTEM},
                    {"role": "user", "content": sample},
                ],
                _Label,
                temperature=0.2,
            )
        except Exception:
            continue
        db.add(
            Theme(
                company_id=company_id,
                label=lbl.label[:300],
                summary=lbl.summary,
                member_insight_ids=[m.id for m in members],
            )
        )
        count += 1
    db.commit()
    log.info("themes_clustered", company_id=company_id, count=count)
    return count


def cluster_themes_job() -> None:
    from app.db import SessionLocal

    with SessionLocal() as db:
        for c in db.execute(select(Company)).scalars():
            cluster_themes(db, c.id)
