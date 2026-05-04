import { apiClient } from '../lib/axios';
import { Report, CreateReportRequest } from '@speedygo/types';

export const reportService = {
  create: (data: CreateReportRequest) =>
    apiClient.post<Report>('/reports/', data).then(r => r.data),
};

