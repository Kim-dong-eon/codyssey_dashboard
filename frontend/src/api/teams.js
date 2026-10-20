import { api } from './axios';

export const teamsApi = {
  async list(cohortId) {
    const { data } = await api.get(`/teams/cohort/${cohortId}`);
    return data;
  },
  async create(team) {
    const { data } = await api.post('/teams/', team);
    return data;
  },
  async delete(teamId) {
    const { data } = await api.delete(`/teams/${teamId}`);
    return data;
  },
  async listProjects(cohortId) {
    const { data } = await api.get(`/teams/cohort/${cohortId}/projects`);
    return data;
  },
  async listMemos(teamId) {
    const { data } = await api.get(`/teams/${teamId}/memos`);
    return data;
  },
  async listCohortMemos(cohortId) {
    const { data } = await api.get(`/teams/cohort/${cohortId}/memos`);
    return data;
  },
  async listCallCampaigns(cohortId) {
    const { data } = await api.get(`/teams/cohort/${cohortId}/call-campaigns`);
    return data;
  },
  async createCallCampaign(cohortId, campaign) {
    const { data } = await api.post(`/teams/cohort/${cohortId}/call-campaigns`, campaign);
    return data;
  },
  async updateCallCampaign(cohortId, campaignId, changes) {
    const { data } = await api.patch(`/teams/cohort/${cohortId}/call-campaigns/${campaignId}`, changes);
    return data;
  },
  async deleteCallCampaign(cohortId, campaignId) {
    const { data } = await api.delete(`/teams/cohort/${cohortId}/call-campaigns/${campaignId}`);
    return data;
  },
  async createMemo(teamId, memo) {
    const { data } = await api.post(`/teams/${teamId}/memos`, memo);
    return data;
  },
  async deleteMemo(teamId, memoId) {
    const { data } = await api.delete(`/teams/${teamId}/memos/${memoId}`);
    return data;
  },
  async updateMemo(teamId, memoId, changes) {
    const { data } = await api.patch(`/teams/${teamId}/memos/${memoId}`, changes);
    return data;
  },
  async listBoardMemos(cohortId) {
    const { data } = await api.get(`/teams/cohort/${cohortId}/board-memos`);
    return data;
  },
  async createBoardMemo(cohortId, memo) {
    const { data } = await api.post(`/teams/cohort/${cohortId}/board-memos`, memo);
    return data;
  },
  async deleteBoardMemo(cohortId, memoId) {
    const { data } = await api.delete(`/teams/cohort/${cohortId}/board-memos/${memoId}`);
    return data;
  }
};
