import { useMemo, useState } from "react";

const initialFilters = {
  academic_year: "",
  class_name: "",
  section: ""
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

const collator = new Intl.Collator("en-IN", {
  numeric: true,
  sensitivity: "base"
});

export function emptyClassSectionFilters() {
  return { ...initialFilters };
}

function formatCurrency(value) {
  return currency.format(Number(value || 0));
}

function getUniqueValues(values, direction = "asc") {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  uniqueValues.sort((left, right) => collator.compare(left, right));
  if (direction === "desc") {
    uniqueValues.reverse();
  }
  return uniqueValues;
}

export default function ClassSectionBrowser({
  filters,
  onFilterChange,
  onBrowse,
  onSelect,
  options,
  optionsLoading,
  results,
  hasBrowsed,
  loading,
  error,
  selectedStudentId
}) {
  const [isOpen, setIsOpen] = useState(true);

  const academicYears = useMemo(
    () => getUniqueValues(options.map((option) => option.academic_year), "desc"),
    [options]
  );

  const classOptions = useMemo(() => {
    const matchingOptions = options.filter(
      (option) => !filters.academic_year || option.academic_year === filters.academic_year
    );
    return getUniqueValues(matchingOptions.map((option) => option.class_name));
  }, [filters.academic_year, options]);

  const sectionOptions = useMemo(() => {
    const matchingOptions = options.filter(
      (option) =>
        (!filters.academic_year || option.academic_year === filters.academic_year) &&
        (!filters.class_name || option.class_name === filters.class_name)
    );
    return getUniqueValues(matchingOptions.map((option) => option.section));
  }, [filters.academic_year, filters.class_name, options]);

  function handleChange(event) {
    const { name, value } = event.target;

    if (name === "academic_year") {
      onFilterChange({
        academic_year: value,
        class_name: "",
        section: ""
      });
      return;
    }

    if (name === "class_name") {
      onFilterChange({
        ...filters,
        class_name: value,
        section: ""
      });
      return;
    }

    onFilterChange({ ...filters, [name]: value });
  }

  function handleSubmit(event) {
    event.preventDefault();
    onBrowse();
  }

  const canBrowse = Boolean(filters.class_name && filters.section);
  const summaryText = optionsLoading
    ? "Loading available class and section combinations."
    : results.length > 0
      ? `${results.length} student${results.length === 1 ? "" : "s"} sorted by highest fee due first.`
      : hasBrowsed
        ? "No students are mapped to this class and section."
        : "Choose a class and section to list students in descending order of fee due.";

  return (
    <section className="panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Class view</p>
          <h2>Class and section dues</h2>
          <p className="panel-note">
            {summaryText} Click any student below to open the full fee summary table on the right.
          </p>
        </div>
        <button type="button" className="section-toggle" onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? "Hide class view" : "Open class view"}
        </button>
      </div>

      {isOpen ? (
        <>
          <form className="search-grid" onSubmit={handleSubmit}>
            <label>
              Academic Year
              <select
                name="academic_year"
                value={filters.academic_year}
                onChange={handleChange}
                disabled={optionsLoading || options.length === 0}
              >
                <option value="">All academic years</option>
                {academicYears.map((academicYear) => (
                  <option key={academicYear} value={academicYear}>
                    {academicYear}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Class
              <select
                name="class_name"
                value={filters.class_name}
                onChange={handleChange}
                disabled={optionsLoading || classOptions.length === 0}
              >
                <option value="">Select class</option>
                {classOptions.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Section
              <select
                name="section"
                value={filters.section}
                onChange={handleChange}
                disabled={optionsLoading || !filters.class_name || sectionOptions.length === 0}
              >
                <option value="">Select section</option>
                {sectionOptions.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="secondary-button" disabled={!canBrowse || loading || optionsLoading}>
              {loading ? "Loading students..." : "Show students"}
            </button>
          </form>

          {error ? <div className="error-banner">{error}</div> : null}

          <div className="results-list">
            {!canBrowse ? (
              <p className="muted-text">Select a class and section to load students with the highest dues first.</p>
            ) : null}

            {canBrowse && !loading && hasBrowsed && results.length === 0 ? (
              <p className="muted-text">No students found for the selected class and section.</p>
            ) : null}

            {results.map((student) => (
              <button
                key={student.id}
                type="button"
                className={`result-card ${selectedStudentId === student.id ? "active" : ""}`}
                onClick={() => onSelect(student)}
              >
                <div className="result-card-stack">
                  <strong>{student.student_name}</strong>
                  <span>{student.admission_number}</span>
                  <small>
                    {student.academic_year} | {student.class_name} - {student.section}
                  </small>
                </div>
                <div className="result-card-side">
                  <span className="pending-pill">{formatCurrency(student.total_pending)} due</span>
                  <small>Open fee summary</small>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
