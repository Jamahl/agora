from __future__ import annotations

import csv
from io import StringIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Company, Employee
from app.schemas import EmployeeIn, EmployeeOut
from app.security import get_current_company

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeOut])
def list_employees(
    status_filter: Optional[str] = "active",
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[Employee]:
    q = select(Employee).where(Employee.company_id == company.id)
    if status_filter and status_filter != "all":
        q = q.where(Employee.status == status_filter)
    q = q.order_by(Employee.name)
    return list(db.execute(q).scalars())


@router.post("", response_model=EmployeeOut, status_code=201)
def create_employee(
    body: EmployeeIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> Employee:
    existing = db.execute(
        select(Employee).where(
            Employee.company_id == company.id, Employee.email == body.email
        )
    ).scalar_one_or_none()
    if existing:
        if existing.status == "archived":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                {
                    "code": "email_archived",
                    "message": f"{body.email} is archived. Restore instead?",
                    "employee_id": existing.id,
                    "name": existing.name,
                },
            )
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "code": "email_exists",
                "message": f"{body.email} is already in use by {existing.name}.",
                "employee_id": existing.id,
            },
        )
    emp = Employee(
        company_id=company.id,
        name=body.name,
        email=body.email,
        job_title=body.job_title,
        department=body.department,
        linkedin_url=body.linkedin_url,
        manager_id=body.manager_id,
    )
    db.add(emp)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists in this company")
    db.refresh(emp)
    return emp


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    body: EmployeeIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> Employee:
    emp = db.get(Employee, employee_id)
    if not emp or emp.company_id != company.id:
        raise HTTPException(404, "Not found")
    emp.name = body.name
    emp.email = body.email
    emp.job_title = body.job_title
    emp.department = body.department
    emp.linkedin_url = body.linkedin_url
    emp.manager_id = body.manager_id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists in this company")
    db.refresh(emp)
    return emp


@router.post("/{employee_id}/archive", response_model=EmployeeOut)
def archive_employee(
    employee_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> Employee:
    emp = db.get(Employee, employee_id)
    if not emp or emp.company_id != company.id:
        raise HTTPException(404, "Not found")
    emp.status = "archived"
    db.commit()
    db.refresh(emp)
    return emp


@router.post("/{employee_id}/restore", response_model=EmployeeOut)
def restore_employee(
    employee_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> Employee:
    emp = db.get(Employee, employee_id)
    if not emp or emp.company_id != company.id:
        raise HTTPException(404, "Not found")
    emp.status = "active"
    db.commit()
    db.refresh(emp)
    return emp


@router.post("/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    raw = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(StringIO(raw))
    required = {"name", "email"}
    missing = required - set(h.strip().lower() for h in (reader.fieldnames or []))
    if missing:
        raise HTTPException(400, f"Missing columns: {','.join(missing)}")

    manager_map: dict[str, int] = {}
    created: list[Employee] = []
    errors: list[dict] = []
    pending_manager: list[tuple[int, str]] = []

    for idx, row in enumerate(reader, start=2):
        row = {k.strip().lower(): (v.strip() if v else "") for k, v in row.items()}
        email = row.get("email") or ""
        name = row.get("name") or ""
        if not email or not name:
            errors.append({"row": idx, "error": "missing name or email"})
            continue
        emp = Employee(
            company_id=company.id,
            name=name,
            email=email,
            job_title=row.get("job_title") or None,
            department=row.get("department") or None,
            linkedin_url=row.get("linkedin_url") or None,
        )
        db.add(emp)
        try:
            db.flush()
            created.append(emp)
            manager_map[email.lower()] = emp.id
            mgr_email = (row.get("manager_email") or "").lower()
            if mgr_email:
                pending_manager.append((emp.id, mgr_email))
        except IntegrityError:
            db.rollback()
            errors.append({"row": idx, "error": "duplicate email"})

    for emp_id, mgr_email in pending_manager:
        mgr_id = manager_map.get(mgr_email)
        if not mgr_id:
            existing = db.execute(
                select(Employee).where(
                    Employee.company_id == company.id, Employee.email == mgr_email
                )
            ).scalar_one_or_none()
            if existing:
                mgr_id = existing.id
        if mgr_id and mgr_id != emp_id:
            emp = db.get(Employee, emp_id)
            if emp:
                emp.manager_id = mgr_id

    db.commit()
    return {"created": len(created), "errors": errors}
