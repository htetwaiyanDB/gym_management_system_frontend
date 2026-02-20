import axios from "axios";
import { clearPersistedSession, getStoredToken } from "../utils/sessionPersistence";

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },

  // ✅ IMPORTANT: captcha/session needs cookie
  withCredentials: true,

  // ✅ Laravel/Sanctum style cookie names (safe to include)
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
});

// Add bearer token if exists
axiosClient.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearPersistedSession();
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
