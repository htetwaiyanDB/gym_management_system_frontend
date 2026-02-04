import axiosClient from "./axiosClient";

export const scanRfidAttendance = (cardId) =>
  axiosClient.post("/attendance/rfid/scan", { card_id: String(cardId) });

export const registerRfidCard = (userId, cardId) =>
  axiosClient.post("/attendance/rfid/register", {
    user_id: Number(userId),
    card_id: String(cardId),
  });
