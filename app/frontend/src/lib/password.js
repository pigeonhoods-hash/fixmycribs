// Shared strong-password policy (must match backend validate_password_strength)
export const PASSWORD_RULES = [
  { key: "len", label: "At least 8 characters", test: (p) => (p || "").length >= 8 },
  { key: "upper", label: "One uppercase letter (A-Z)", test: (p) => /[A-Z]/.test(p || "") },
  { key: "lower", label: "One lowercase letter (a-z)", test: (p) => /[a-z]/.test(p || "") },
  { key: "number", label: "One number (0-9)", test: (p) => /\d/.test(p || "") },
  { key: "special", label: "One special character (!@#$…)", test: (p) => /[^A-Za-z0-9]/.test(p || "") },
];

export function passwordIssues(pw) {
  return PASSWORD_RULES.filter((r) => !r.test(pw || ""));
}

export function isStrongPassword(pw) {
  return passwordIssues(pw).length === 0;
}

export const PASSWORD_POLICY_TEXT =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.";

// FastAPI 422 returns an array of {msg} objects; normalize any error shape to a string.
export function formatApiError(detail, fallback = "Something went wrong. Please try again.") {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return (
      detail
        .map((e) => (e && typeof e.msg === "string" ? e.msg : typeof e === "string" ? e : JSON.stringify(e)))
        .filter(Boolean)
        .join(" ") || fallback
    );
  if (detail && typeof detail.msg === "string") return detail.msg;
  return fallback;
}
