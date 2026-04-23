import { useEffect, useRef, useState } from "react";
import ClassSectionBrowser, { emptyClassSectionFilters } from "./components/ClassSectionBrowser";
import ChangePasswordForm from "./components/ChangePasswordForm";
import LoginForm from "./components/LoginForm";
import StudentDetails from "./components/StudentDetails";
import StudentForm from "./components/StudentForm";
import StudentSearch, { emptySearchFilters } from "./components/StudentSearch";
import {
  changePassword,
  createStudent,
  downloadPaymentReceipt,
  downloadStudentPaymentHistory,
  downloadStudentStatement,
  getClassSectionOptions,
  getCurrentUser,
  getStudent,
  getStudentsByClassSection,
  login,
  recordPayment,
  searchStudents,
  updateStudent
} from "./lib/api";
import { PORTAL_NAME, PORTAL_TAGLINE, SCHOOL_NAME } from "./lib/branding";

const SESSION_KEY = "school-portal-session";
const SESSION_TIMEOUT_MINUTES = Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES || 15);
const SESSION_TIMEOUT_MS = Math.max(1, SESSION_TIMEOUT_MINUTES) * 60 * 1000;

function isSessionExpired(session) {
  if (!session?.lastActivityAt) {
    return true;
  }
  return Date.now() - Number(session.lastActivityAt) >= SESSION_TIMEOUT_MS;
}

function loadSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw);
    if (!session?.token || isSessionExpired(session)) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStudentPayload(form) {
  return {
    ...form,
    admission_fee: Number(form.admission_fee || 0),
    first_term_fee: Number(form.first_term_fee || 0),
    second_term_fee: Number(form.second_term_fee || 0),
    third_term_fee: Number(form.third_term_fee || 0),
    transport_fee: Number(form.transport_fee || 0),
    books_fee: Number(form.books_fee || 0),
    concession_transport: Number(form.concession_transport || 0)
  };
}

function hasSearchFilters(filters) {
  return Object.values(filters).some((value) => String(value || "").trim() !== "");
}

function matchesSearchFilters(student, filters) {
  if (filters.admission_number && normalizeText(student.admission_number) !== normalizeText(filters.admission_number)) {
    return false;
  }
  if (filters.academic_year && normalizeText(student.academic_year) !== normalizeText(filters.academic_year)) {
    return false;
  }
  if (filters.student_name && !normalizeText(student.student_name).includes(normalizeText(filters.student_name))) {
    return false;
  }
  if (filters.class_name && normalizeText(student.class_name) !== normalizeText(filters.class_name)) {
    return false;
  }
  return true;
}

function matchesClassSectionFilters(student, filters) {
  if (filters.academic_year && normalizeText(student.academic_year) !== normalizeText(filters.academic_year)) {
    return false;
  }
  if (filters.class_name && normalizeText(student.class_name) !== normalizeText(filters.class_name)) {
    return false;
  }
  if (filters.section && normalizeText(student.section) !== normalizeText(filters.section)) {
    return false;
  }
  return true;
}

function toStudentListItem(student) {
  return {
    id: student.id,
    academic_year: student.academic_year,
    admission_number: student.admission_number,
    student_name: student.student_name,
    class_name: student.class_name,
    section: student.section,
    mobile_number: student.mobile_number,
    updated_at: student.updated_at
  };
}

function toStudentDueListItem(student) {
  return {
    id: student.id,
    academic_year: student.academic_year,
    admission_number: student.admission_number,
    student_name: student.student_name,
    class_name: student.class_name,
    section: student.section,
    mobile_number: student.mobile_number,
    total_pending: student.fee_summary.total_pending,
    updated_at: student.updated_at
  };
}

function upsertStudent(results, student) {
  const nextItem = toStudentListItem(student);
  const otherStudents = results.filter((item) => item.id !== nextItem.id);
  return [nextItem, ...otherStudents].sort((left, right) => left.student_name.localeCompare(right.student_name));
}

function sortByPendingDue(results) {
  return [...results].sort((left, right) => {
    const dueDifference = Number(right.total_pending || 0) - Number(left.total_pending || 0);
    if (dueDifference !== 0) {
      return dueDifference;
    }

    const nameDifference = left.student_name.localeCompare(right.student_name);
    if (nameDifference !== 0) {
      return nameDifference;
    }

    return left.admission_number.localeCompare(right.admission_number);
  });
}

function syncStudentWithSearchResults(results, student, filters) {
  const nextItem = toStudentListItem(student);
  const otherStudents = results.filter((item) => item.id !== nextItem.id);
  if (!matchesSearchFilters(nextItem, filters)) {
    return otherStudents;
  }
  return upsertStudent(results, student);
}

function syncStudentWithClassSectionResults(results, student, filters) {
  const nextItem = toStudentDueListItem(student);
  const otherStudents = results.filter((item) => item.id !== nextItem.id);
  if (!matchesClassSectionFilters(nextItem, filters)) {
    return sortByPendingDue(otherStudents);
  }
  return sortByPendingDue([nextItem, ...otherStudents]);
}

function downloadBlobToBrowser({ blob, filename }) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
}

export default function App() {
  const [session, setSession] = useState(loadSession);
  const [user, setUser] = useState(loadSession()?.user || null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [searchFilters, setSearchFilters] = useState(emptySearchFilters);
  const [classSectionFilters, setClassSectionFilters] = useState(emptyClassSectionFilters);
  const [classSectionOptions, setClassSectionOptions] = useState([]);
  const [classSectionOptionsLoading, setClassSectionOptionsLoading] = useState(false);
  const [classSectionResults, setClassSectionResults] = useState([]);
  const [classSectionLoading, setClassSectionLoading] = useState(false);
  const [classSectionError, setClassSectionError] = useState("");
  const [hasBrowsedClassSection, setHasBrowsedClassSection] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentLoadError, setStudentLoadError] = useState("");
  const [studentFormMode, setStudentFormMode] = useState(null);
  const [studentFormScrollKey, setStudentFormScrollKey] = useState(0);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savingStudent, setSavingStudent] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const sessionTimeoutRef = useRef(null);

  function clearSessionTimeout() {
    if (sessionTimeoutRef.current !== null) {
      window.clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
  }

  function touchSessionActivity() {
    setSession((current) => {
      if (!current?.token) {
        return current;
      }
      const nextSession = { ...current, lastActivityAt: Date.now() };
      saveSession(nextSession);
      return nextSession;
    });
  }

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    let ignore = false;
    getCurrentUser(session.token)
      .then((currentUser) => {
        if (!ignore) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (!ignore) {
          handleLogout();
        }
      });

    return () => {
      ignore = true;
    };
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    let ignore = false;
    setClassSectionOptionsLoading(true);
    setClassSectionError("");

    getClassSectionOptions(session.token)
      .then((options) => {
        if (!ignore) {
          setClassSectionOptions(options);
        }
      })
      .catch((error) => {
        if (!ignore) {
          setClassSectionOptions([]);
          setClassSectionError(error.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setClassSectionOptionsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [session?.token]);

  async function handleLogin(credentials) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const result = await login(credentials);
      const nextSession = { token: result.access_token, user: result.user, lastActivityAt: Date.now() };
      setSession(nextSession);
      setUser(result.user);
      saveSession(nextSession);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    clearSessionTimeout();
    setSession(null);
    setUser(null);
    setActiveStudentId(null);
    setSelectedStudent(null);
    setStudentLoadError("");
    setStudentFormMode(null);
    setShowPasswordForm(false);
    setPasswordError("");
    setSearchResults([]);
    setHasSearched(false);
    setClassSectionFilters(emptyClassSectionFilters());
    setClassSectionOptions([]);
    setClassSectionResults([]);
    setHasBrowsedClassSection(false);
    setClassSectionError("");
    saveSession(null);
  }

  useEffect(() => {
    if (!session?.token) {
      clearSessionTimeout();
      return;
    }

    if (isSessionExpired(session)) {
      handleLogout();
      return;
    }

    const remainingMs = SESSION_TIMEOUT_MS - (Date.now() - Number(session.lastActivityAt));
    sessionTimeoutRef.current = window.setTimeout(() => {
      handleLogout();
    }, Math.max(0, remainingMs));

    return () => {
      clearSessionTimeout();
    };
  }, [session]);

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    let lastTouchMs = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastTouchMs < 5000) {
        return;
      }
      lastTouchMs = now;
      touchSessionActivity();
    };

    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
    };
  }, [session?.token]);

  async function handleSearch(filters = searchFilters) {
    if (!session?.token) {
      return;
    }

    if (!hasSearchFilters(filters)) {
      setSearchResults([]);
      setHasSearched(true);
      return;
    }

    setSearchLoading(true);
    try {
      const students = await searchStudents(session.token, filters);
      setSearchResults(students);
      setHasSearched(true);
    } finally {
      setSearchLoading(false);
    }
  }

  function handleClassSectionFilterChange(nextFilters) {
    setClassSectionFilters(nextFilters);
    setClassSectionResults([]);
    setHasBrowsedClassSection(false);
    setClassSectionError("");
  }

  async function handleBrowseClassSection(filters = classSectionFilters) {
    if (!session?.token) {
      return;
    }

    if (!filters.class_name || !filters.section) {
      setClassSectionResults([]);
      setHasBrowsedClassSection(false);
      return;
    }

    setClassSectionLoading(true);
    setClassSectionError("");
    setHasBrowsedClassSection(true);
    try {
      const students = await getStudentsByClassSection(session.token, filters);
      setClassSectionResults(students);
    } catch (error) {
      setClassSectionResults([]);
      setClassSectionError(error.message);
    } finally {
      setClassSectionLoading(false);
    }
  }

  async function handleStudentSave(form) {
    if (!session?.token) {
      return null;
    }

    const isEditMode = studentFormMode === "edit" && selectedStudent;
    setSavingStudent(true);
    setSaveError("");
    try {
      const payload = normalizeStudentPayload(form);
      const student = isEditMode
        ? await updateStudent(session.token, selectedStudent.id, payload)
        : await createStudent(session.token, payload);
      setActiveStudentId(student.id);
      setSelectedStudent(student);
      setStudentFormMode(null);
      if (hasSearched) {
        setSearchResults((current) => syncStudentWithSearchResults(current, student, searchFilters));
      }
      if (hasBrowsedClassSection) {
        setClassSectionResults((current) => syncStudentWithClassSectionResults(current, student, classSectionFilters));
      }
      getClassSectionOptions(session.token)
        .then((options) => setClassSectionOptions(options))
        .catch((error) => setClassSectionError(error.message));
      return student;
    } catch (error) {
      setSaveError(error.message);
      return null;
    } finally {
      setSavingStudent(false);
    }
  }

  async function handlePasswordChange(form) {
    if (!session?.token) {
      return null;
    }

    setChangingPassword(true);
    setPasswordError("");
    try {
      const result = await changePassword(session.token, form);
      return result.detail;
    } catch (error) {
      setPasswordError(error.message);
      return null;
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleRecordPayment(payload) {
    if (!session?.token || !selectedStudent) {
      return null;
    }

    if (payload.allocations.length === 0) {
      setPaymentError("Enter at least one component amount before saving the payment.");
      return null;
    }

    setStudentLoadError("");
    setSavingPayment(true);
    setPaymentError("");
    try {
      const student = await recordPayment(session.token, selectedStudent.id, payload);
      setActiveStudentId(student.id);
      setSelectedStudent(student);
      if (hasSearched) {
        setSearchResults((current) => syncStudentWithSearchResults(current, student, searchFilters));
      }
      if (hasBrowsedClassSection) {
        setClassSectionResults((current) => syncStudentWithClassSectionResults(current, student, classSectionFilters));
      }
      return student;
    } catch (error) {
      setPaymentError(error.message);
      return null;
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleDownloadStatement() {
    if (!session?.token || !selectedStudent) {
      return;
    }

    downloadBlobToBrowser(await downloadStudentStatement(session.token, selectedStudent.id));
  }

  async function handleDownloadPaymentReceipt(transactionId) {
    if (!session?.token || !selectedStudent || !transactionId) {
      return;
    }

    downloadBlobToBrowser(await downloadPaymentReceipt(session.token, selectedStudent.id, transactionId));
  }

  async function handleDownloadPaymentHistory() {
    if (!session?.token || !selectedStudent) {
      return;
    }

    downloadBlobToBrowser(await downloadStudentPaymentHistory(session.token, selectedStudent.id));
  }

  async function handleSelectStudent(student) {
    if (!session?.token) {
      return;
    }

    setActiveStudentId(student.id);
    if (selectedStudent?.id !== student.id) {
      setSelectedStudent(null);
    }
    setStudentLoading(true);
    setStudentLoadError("");
    setSaveError("");
    setPaymentError("");
    setStudentFormMode(null);
    try {
      const fullStudent = await getStudent(session.token, student.id);
      setSelectedStudent(fullStudent);
    } catch (error) {
      setSelectedStudent(null);
      setStudentLoadError(error.message);
    } finally {
      setStudentLoading(false);
    }
  }

  function handleOpenCreateForm() {
    setSaveError("");
    setShowPasswordForm(false);
    setStudentFormMode("create");
    setStudentFormScrollKey((current) => current + 1);
  }

  function handleOpenEditForm() {
    if (!selectedStudent) {
      return;
    }
    setSaveError("");
    setShowPasswordForm(false);
    setStudentFormMode("edit");
    setStudentFormScrollKey((current) => current + 1);
  }

  function handleCloseStudentForm() {
    setSaveError("");
    setStudentFormMode(null);
  }

  function handleTogglePasswordForm() {
    setPasswordError("");
    setShowPasswordForm((current) => {
      const next = !current;
      if (next) {
        setStudentFormMode(null);
      }
      return next;
    });
  }

  if (!session?.token) {
    return <LoginForm onSubmit={handleLogin} loading={authLoading} error={authError} />;
  }

  const formStudent = studentFormMode === "edit" ? selectedStudent : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="school-seal">SSHS</div>
          <div>
            <p className="eyebrow">{SCHOOL_NAME}</p>
            <h1>{PORTAL_NAME}</h1>
            <p className="panel-note">{PORTAL_TAGLINE}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="user-chip">
            <span>Signed in as</span>
            <strong>{user?.username}</strong>
          </div>
          <button type="button" className="ghost-button" onClick={handleTogglePasswordForm}>
            {showPasswordForm ? "Hide Password" : "Change Password"}
          </button>
          <button type="button" className="ghost-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-grid">
        <div className="left-column">
          {showPasswordForm ? (
            <ChangePasswordForm
              saving={changingPassword}
              error={passwordError}
              onSave={handlePasswordChange}
              onClose={() => {
                setPasswordError("");
                setShowPasswordForm(false);
              }}
            />
          ) : null}

          <section className="panel workspace-panel">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>{selectedStudent ? `Selected: ${selectedStudent.student_name}` : "Admissions and payment records"}</h2>
              <p className="panel-note">
                {selectedStudent
                  ? "Review balances, inspect the full payment trail, or update the official student fee profile."
                  : "Search for an existing student or open a new admission record when fee details are entered."}
              </p>
            </div>
            <div className="workspace-actions">
              <button type="button" className="primary-button" onClick={handleOpenCreateForm}>
                Create Student
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleOpenEditForm}
                disabled={!selectedStudent}
              >
                Edit Selected
              </button>
            </div>
          </section>

          <ClassSectionBrowser
            filters={classSectionFilters}
            onFilterChange={handleClassSectionFilterChange}
            onBrowse={() => handleBrowseClassSection(classSectionFilters)}
            onSelect={handleSelectStudent}
            options={classSectionOptions}
            optionsLoading={classSectionOptionsLoading}
            results={classSectionResults}
            hasBrowsed={hasBrowsedClassSection}
            loading={classSectionLoading}
            error={classSectionError}
            selectedStudentId={activeStudentId}
          />

          <StudentSearch
            filters={searchFilters}
            onFilterChange={setSearchFilters}
            onSearch={() => handleSearch(searchFilters)}
            onSelect={handleSelectStudent}
            results={searchResults}
            hasSearched={hasSearched}
            loading={searchLoading}
            selectedStudentId={activeStudentId}
          />
          {studentFormMode ? (
            <StudentForm
              mode={studentFormMode}
              student={formStudent}
              onSave={handleStudentSave}
              saving={savingStudent}
              error={saveError}
              onClose={handleCloseStudentForm}
              scrollRequestKey={studentFormScrollKey}
            />
          ) : null}
        </div>

        <StudentDetails
          student={selectedStudent}
          loading={studentLoading}
          loadError={studentLoadError}
          onRecordPayment={handleRecordPayment}
          onDownloadStatement={handleDownloadStatement}
          onDownloadPaymentReceipt={handleDownloadPaymentReceipt}
          onDownloadPaymentHistory={handleDownloadPaymentHistory}
          savingPayment={savingPayment}
          error={paymentError}
          onEditStudent={handleOpenEditForm}
        />
      </main>
    </div>
  );
}
