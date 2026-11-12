import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { Faculty } from "../types";

const EMPLOYMENT_TYPES = ["full-time", "part-time", "adjunct"];
const EMPTY_FORM = { name: "", email: "", department: "", employmentType: "full-time", maxLoad: "12" };

export function FacultyPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  function startAdd() {
    if (showForm) {
      closeForm();
    } else {
      setEditingId(null);
      setForm(EMPTY_FORM);
      setShowForm(true);
    }
  }

  function startEdit(f: Faculty) {
    setEditingId(f.id);
    setForm({
      name: f.name,
      email: f.email,
      department: f.department,
      employmentType: f.employmentType,
      maxLoad: String(f.maxLoad),
    });
    setShowForm(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function load() {
    setFaculty(await api.get<Faculty[]>("/faculty"));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId !== null) {
        await api.put(`/faculty/${editingId}`, form);
      } else {
        await api.post("/faculty", form);
      }
      closeForm();
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this faculty member? Their assignments will also be removed.")) return;
    try {
      await api.del(`/faculty/${id}`);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Faculty</h2>
        {isAdmin && (
          <button className="primary" onClick={startAdd}>
            {showForm ? "Cancel" : "+ Add Faculty"}
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && isAdmin && (
        <form className="card" style={{ marginBottom: 20 }} onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Email
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>
              Department
              <input required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </label>
            <label>
              Employment Type
              <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Max Load (hours/term)
              <input required type="number" step="0.5" min="0" value={form.maxLoad} onChange={(e) => setForm({ ...form, maxLoad: e.target.value })} />
            </label>
          </div>
          <button className="primary" type="submit">{editingId !== null ? "Update Faculty" : "Save Faculty"}</button>
        </form>
      )}

      {faculty.length === 0 ? (
        <p className="empty-state">No faculty yet. Add one to get started.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Type</th>
              <th>Max Load</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {faculty.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td>{f.email}</td>
                <td>{f.department}</td>
                <td>{f.employmentType}</td>
                <td>{f.maxLoad}</td>
                {isAdmin && (
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => startEdit(f)} style={{ marginRight: 6 }}>Edit</button>
                    <button className="danger" onClick={() => handleDelete(f.id)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
