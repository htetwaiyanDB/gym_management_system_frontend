import axiosClient from "./axiosClient";

function numericCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export function unreadCountFromPayload(payload) {
  return numericCount(payload?.unread_count ?? payload?.data?.unread_count);
}

export async function getAdminUnreadMessageCount() {
  const response = await axiosClient.get("/messages/unread-count", { cache: false });
  return unreadCountFromPayload(response?.data);
}

export async function markAdminConversationAsRead(userId) {
  const response = await axiosClient.post(`/messages/${userId}/mark-as-read`);
  return {
    unreadCount: unreadCountFromPayload(response?.data),
    markedCount: numericCount(response?.data?.marked_count ?? response?.data?.data?.marked_count),
  };
}
