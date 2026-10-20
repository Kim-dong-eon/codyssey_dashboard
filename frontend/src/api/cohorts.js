import { api } from './axios';

export const cohortsApi = {
  async list() {
    const { data } = await api.get('/cohorts/');
    return data;
  },
  async create(cohort) {
    const { data } = await api.post('/cohorts/', cohort);
    return data;
  },
  async updateDeadline(cohortId, endDate) {
    const { data } = await api.patch(`/cohorts/${cohortId}`, { end_date: endDate });
    return data;
  }
};
