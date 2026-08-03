import type { CreateReportPayload, ReportRead } from '@/types/api';
import { apiRequest } from './client';

export async function createReport(payload: CreateReportPayload): Promise<ReportRead> {
  return apiRequest<ReportRead>('/reports', {
    method: 'POST',
    body: payload
  });
}

export async function getMyReports(): Promise<ReportRead[]> {
  return apiRequest<ReportRead[]>('/reports/me');
}
