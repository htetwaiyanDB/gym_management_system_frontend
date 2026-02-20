import axiosClient from "./axiosClient";

export const loginApi = ({ email, password }) =>
  axiosClient.post("/login", { email, password });

export const logoutApi = () => axiosClient.post("/logout");
export const meApi = () => axiosClient.get("/user");
