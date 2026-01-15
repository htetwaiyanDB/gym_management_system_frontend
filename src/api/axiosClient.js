import axios from "axios";

// MUST point to backend + port
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://8.222.195.9:6060";

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  withCredentials: false, // token-based auth
});

function getToken() {
  return (
    localStorage.getItem("ACCESS_TOKEN") ||
    sessionStorage.getItem("ACCESS_TOKEN")
  );
}

axiosClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axiosClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("ACCESS_TOKEN");
      localStorage.removeItem("user");
      sessionStorage.removeItem("ACCESS_TOKEN");
      sessionStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default axiosClient;
