const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

function getBackendUnavailableMessage() {
  return "Backend API is not reachable. Deploy the FastAPI backend and set VITE_API_URL to that backend /api URL.";
}

async function getErrorMessage(response) {
  const contentType = response.headers.get("Content-Type") || "";

  if (contentType.includes("text/html")) {
    return getBackendUnavailableMessage();
  }

  try {
    const data = await response.json();
    return data.detail || "Something went wrong";
  } catch {
    return response.statusText || "Something went wrong";
  }
}

async function request(path, { method = "GET", token, body } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error(getBackendUnavailableMessage());
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json();
}

async function downloadFile(path, token, fallbackFilename) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  } catch {
    throw new Error(getBackendUnavailableMessage());
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  const disposition = response.headers.get("Content-Disposition") || "";
  const matchedFileName = disposition.match(/filename="([^"]+)"/i);
  return {
    blob: await response.blob(),
    filename: matchedFileName?.[1] || fallbackFilename
  };
}

export function login(credentials) {
  return request("/auth/login", { method: "POST", body: credentials });
}

export function getCurrentUser(token) {
  return request("/auth/me", { token });
}

export function changePassword(token, payload) {
  return request("/auth/change-password", { method: "POST", token, body: payload });
}

export function searchStudents(token, filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return request(`/students${query ? `?${query}` : ""}`, { token });
}

export function getStudent(token, id) {
  return request(`/students/${id}`, { token });
}

export function getClassSectionOptions(token) {
  return request("/students/class-sections", { token });
}

export function getStudentsByClassSection(token, filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return request(`/students/by-class-section?${params.toString()}`, { token });
}

export function createStudent(token, payload) {
  return request("/students", { method: "POST", token, body: payload });
}

export function updateStudent(token, id, payload) {
  return request(`/students/${id}`, { method: "PUT", token, body: payload });
}

export function recordPayment(token, id, payload) {
  return request(`/students/${id}/payments`, { method: "POST", token, body: payload });
}

export async function downloadStudentStatement(token, id) {
  return downloadFile(`/students/${id}/statement.pdf`, token, `student_${id}_statement.pdf`);
}

export function downloadPaymentReceipt(token, studentId, transactionId) {
  return downloadFile(
    `/students/${studentId}/payments/${transactionId}/receipt.pdf`,
    token,
    `payment_${transactionId}_receipt.pdf`
  );
}

export function downloadStudentPaymentHistory(token, studentId) {
  return downloadFile(`/students/${studentId}/payment-history.pdf`, token, `student_${studentId}_payment_history.pdf`);
}
