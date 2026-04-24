"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Employee = {
  id: number;
  name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  manager_id: number | null;
  status: "active" | "archived";
};

type EmployeeForm = {
  name: string;
  email: string;
  job_title: string;
  department: string;
};

export default function EmployeesPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const filter = showArchived ? "all" : "active";
      const data = await api<Employee[]>(`/employees?status_filter=${filter}`);
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [showArchived]);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setModalOpen(true);
  };

  const archive = async (id: number) => {
    await api(`/employees/${id}/archive`, { method: "POST" });
    load();
  };

  const restore = async (id: number) => {
    await api(`/employees/${id}/restore`, { method: "POST" });
    load();
  };

  const importCsv = async (f: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api<{ created: number; errors: any[] }>("/employees/import-csv", {
        method: "POST",
        body: fd,
      });
      alert(`Created ${r.created}. Errors: ${r.errors.length}`);
      load();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="mt-1 text-sm text-ink-500">Manage your roster. Add, edit, archive, or import from CSV.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-ink-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
          <label className={`btn-secondary cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
            {importing ? "Importing…" : "Upload CSV"}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
            />
          </label>
          <button className="btn-primary" onClick={openAdd}>Add employee</button>
        </div>
      </div>

      <div className="card mt-6 p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-ink-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-ink-500">
            <div className="text-sm">
              {showArchived
                ? "No employees yet."
                : "No active employees. Add one manually or upload a CSV."}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-ink-500">
              <tr>
                <th className="text-left font-medium px-5 py-3">Name</th>
                <th className="text-left font-medium px-5 py-3">Email</th>
                <th className="text-left font-medium px-5 py-3">Role</th>
                <th className="text-left font-medium px-5 py-3">Department</th>
                <th className="text-left font-medium px-5 py-3">Status</th>
                <th className="text-right font-medium px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-surface-100">
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/employees/${r.id}`} className="font-medium text-ink-900 hover:text-accent-500">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-ink-500">{r.email}</td>
                  <td className="px-5 py-3 text-ink-500">{r.job_title || "—"}</td>
                  <td className="px-5 py-3 text-ink-500">
                    {r.department ? (
                      <Link href={`/dashboard/departments/${encodeURIComponent(r.department)}`} className="hover:text-accent-500">
                        {r.department}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`badge ${r.status === "active" ? "bg-ok-500/15 text-ok-500" : "bg-surface-100 text-ink-500"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button className="btn-ghost" onClick={() => openEdit(r)}>Edit</button>
                    {r.status === "active" ? (
                      <button className="btn-ghost text-danger-500" onClick={() => archive(r.id)}>Archive</button>
                    ) : (
                      <button className="btn-ghost" onClick={() => restore(r.id)}>Restore</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <EmployeeModal
          employee={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function EmployeeModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EmployeeForm>({
    name: employee?.name || "",
    email: employee?.email || "",
    job_title: employee?.job_title || "",
    department: employee?.department || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (employee) {
        await api(`/employees/${employee.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      } else {
        await api("/employees", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium">{employee ? "Edit employee" : "Add employee"}</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Role</label>
            <input
              className="input"
              value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Department</label>
            <input
              className="input"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
          {error && <div className="text-sm text-danger-500">{error}</div>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
