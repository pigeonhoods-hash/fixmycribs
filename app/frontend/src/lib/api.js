import axios from "axios";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").trim().replace(/\/+$/, "");
// On Vercel, same-origin requests are forwarded to Railway by vercel.json.
// Keep the explicit backend URL for local development.
export const API = process.env.NODE_ENV === "production" ? "/api" : `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("fmc_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const path = window.location.pathname;
      if (path.startsWith("/dashboard")) {
        localStorage.removeItem("fmc_token");
        localStorage.removeItem("fmc_user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);
