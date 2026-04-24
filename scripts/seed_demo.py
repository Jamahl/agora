#!/usr/bin/env python3
"""Seed a demo company with a few employees and OKRs for local exploration.

Usage (from inside the api container):
    docker compose exec api python /app/../scripts/seed_demo.py
or from host with matching DATABASE_URL:
    DATABASE_URL=... python scripts/seed_demo.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))


def main() -> None:
    from app.db import SessionLocal
    from app.models import Company, Employee, OKR, KeyResult

    with SessionLocal() as db:
        c = db.query(Company).first()
        if not c:
            c = Company(
                name="BetterLabs",
                industry="AI research",
                description="AI product studio — ships AI tools for growing teams.",
                admin_email="admin@betterlabs.com.au",
                hr_contact="HR <hr@betterlabs.com.au>",
                cadence_days=14,
            )
            db.add(c)
            db.commit()
            db.refresh(c)
        people = [
            ("Alex Chen", "alex@betterlabs.au", "Engineering Lead", "Engineering"),
            ("Sam Rivera", "sam@betterlabs.au", "Product Designer", "Design"),
            ("Jordan Kim", "jordan@betterlabs.au", "Growth", "Go-to-market"),
        ]
        for n, e, t, d in people:
            if db.query(Employee).filter_by(company_id=c.id, email=e).first():
                continue
            db.add(Employee(company_id=c.id, name=n, email=e, job_title=t, department=d))
        db.commit()
        if not db.query(OKR).filter_by(company_id=c.id).first():
            o = OKR(company_id=c.id, objective="Ship the voice-interview pilot")
            db.add(o)
            db.flush()
            for kr in ["Interview every employee at least twice", "One research request end-to-end"]:
                db.add(KeyResult(okr_id=o.id, description=kr))
            db.commit()
        print(f"Seeded company id={c.id} with employees + OKR")


if __name__ == "__main__":
    main()
