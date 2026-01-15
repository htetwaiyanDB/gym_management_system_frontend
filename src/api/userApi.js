import axiosClient from "./axiosClient";

export const getUserProfile = () => axiosClient.get("/user");

export const getUserHome = () => axiosClient.get("/user/home");

export const getUserCheckIn = () => axiosClient.get("/user/check-in");

export const scanUserCheckIn = (token) =>
  axiosClient.post("/user/check-in/scan", { token });

export const getUserSubscriptions = () => axiosClient.get("/user/subscriptions");

export const getUserMessages = () => axiosClient.get("/user/messages");

export const sendUserMessage = (message) =>
  axiosClient.post("/user/messages", { message });

export const updateUserProfile = (payload) =>
  axiosClient.patch("/user/profile", payload);