import { api } from './axios';

export const traineesApi = {
  async list(cohortId) {
    const { data } = await api.get(`/trainees/cohort/${cohortId}`);
    return data;
  },
  async getDetail(traineeId) {
    const { data } = await api.get(`/trainees/${traineeId}/detail`);
    return data;
  },
  async move(traineeId, changes) {
    const { data } = await api.put(`/trainees/${traineeId}/team`, changes);
    return data;
  },
  async updateStatus(traineeId, changes) {
    const { data } = await api.put(`/trainees/${traineeId}/status`, changes);
    return data;
  },
  async updateDropStatus(traineeId, changes) {
    const { data } = await api.put(`/trainees/${traineeId}/drop`, changes);
    return data;
  },
  async createBulk(payload) {
    const { data } = await api.post('/trainees/bulk', payload);
    return data;
  },
  async createContact(traineeId, payload) {
    const { data } = await api.post(`/trainees/${traineeId}/contact`, payload);
    return data;
  },
  async listCohortContacts(cohortId) {
    const { data } = await api.get(`/trainees/cohort/${cohortId}/contacts`);
    return data;
  },
  async deleteContact(contactId) {
    const { data } = await api.delete(`/trainees/contact/${contactId}`);
    return data;
  },
  async createMemo(traineeId, memo) {
    const { data } = await api.post(`/trainees/${traineeId}/memos`, memo);
    return data;
  },
  async updateMemo(memoId, changes) {
    const { data } = await api.patch(`/trainees/memos/${memoId}`, changes);
    return data;
  },
  async deleteMemo(memoId) {
    const { data } = await api.delete(`/trainees/memos/${memoId}`);
    return data;
  }
};
