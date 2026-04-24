from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import OKR, Company, KeyResult
from app.schemas import OKRExtractIn, OKRExtractOut, OKRIn, OKROut
from app.security import get_current_company
from app.services.embeddings import embed_okr
from app.services.okr_extract import extract_okrs

router = APIRouter(prefix="/okrs", tags=["okrs"])


def _reembed(okr_id: int) -> None:
    from app.db import SessionLocal

    with SessionLocal() as db:
        embed_okr(db, okr_id)


@router.get("", response_model=list[OKROut])
def list_okrs(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[OKR]:
    q = (
        select(OKR)
        .where(OKR.company_id == company.id, OKR.status == "active")
        .options(selectinload(OKR.key_results))
        .order_by(OKR.created_at)
    )
    return list(db.execute(q).scalars())


@router.post("", response_model=OKROut, status_code=201)
def create_okr(
    body: OKRIn,
    bg: BackgroundTasks,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> OKR:
    okr = OKR(company_id=company.id, objective=body.objective)
    db.add(okr)
    db.flush()
    for kr in body.key_results:
        db.add(
            KeyResult(
                okr_id=okr.id,
                description=kr.description,
                target_metric=kr.target_metric,
                current_value=kr.current_value,
            )
        )
    db.commit()
    db.refresh(okr)
    bg.add_task(_reembed, okr.id)
    return okr


@router.patch("/{okr_id}", response_model=OKROut)
def update_okr(
    okr_id: int,
    body: OKRIn,
    bg: BackgroundTasks,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> OKR:
    okr = db.get(OKR, okr_id)
    if not okr or okr.company_id != company.id:
        raise HTTPException(404)
    okr.objective = body.objective
    # naive replace KRs
    for kr in list(okr.key_results):
        db.delete(kr)
    db.flush()
    for kr in body.key_results:
        db.add(
            KeyResult(
                okr_id=okr.id,
                description=kr.description,
                target_metric=kr.target_metric,
                current_value=kr.current_value,
            )
        )
    db.commit()
    db.refresh(okr)
    bg.add_task(_reembed, okr.id)
    return okr


@router.post("/{okr_id}/archive", response_model=OKROut)
def archive_okr(
    okr_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> OKR:
    okr = db.get(OKR, okr_id)
    if not okr or okr.company_id != company.id:
        raise HTTPException(404)
    okr.status = "archived"
    db.commit()
    db.refresh(okr)
    return okr


@router.post("/extract", response_model=OKRExtractOut)
def extract(
    body: OKRExtractIn,
    _company: Company = Depends(get_current_company),
) -> OKRExtractOut:
    return extract_okrs(body.text)
