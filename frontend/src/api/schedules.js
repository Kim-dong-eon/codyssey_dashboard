import { api } from './axios';

export const schedulesApi = {
  async list(cohortId) {
    const { data } = await api.get(`/schedules/cohort/${cohortId}`);
    return data;
  },
  async create(event) {
    const { data } = await api.post('/schedules/', event);
    return data;
  },
  async update(eventId, event) {
    const { data } = await api.put(`/schedules/${eventId}`, event);
    return data;
  },
  async listRoster(eventId) {
    const { data } = await api.get(`/schedules/${eventId}/roster`);
    return data;
  },
  async registerTrainee(eventId, traineeId) {
    const { data } = await api.post(`/schedules/${eventId}/register`, { trainee_id: traineeId });
    return data;
  },
  async cancelRegistration(registrationId) {
    const { data } = await api.put(`/schedules/cancel/${registrationId}`);
    return data;
  },
  async delete(eventId) {
    const { data } = await api.delete(`/schedules/${eventId}`);
    return data;
  }
};
