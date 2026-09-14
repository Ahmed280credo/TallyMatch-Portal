// Base URL of the NestJS backend, e.g. https://ap-automation-backend.onrender.com
// Left empty in local dev: Vite's dev server proxies /api to localhost:3000 (see vite.config.ts).
// Must be set as VITE_API_BASE_URL in the frontend's deployment env once the backend is deployed.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
