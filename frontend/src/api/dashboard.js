import { api } from './axios';

export const dashboardApi = {
  async get(cohortId, range = {}) {
    const { data } = await api.get(`/dashboard/${cohortId}`, { params: range });
    return data;
  },
  async listNotices(cohortId) {
    const { data } = await api.get(`/dashboard/${cohortId}/notices`);
    return data;
  },
  async createNotice(cohortId, notice) {
    const { data } = await api.post(`/dashboard/${cohortId}/notices`, notice);
    return data;
  },
  async updateNotice(noticeId, changes) {
    const { data } = await api.put(`/dashboard/notices/${noticeId}`, changes);
    return data;
  },
  async deleteNotice(noticeId) {
    const { data } = await api.delete(`/dashboard/notices/${noticeId}`);
    return data;
  }
};
