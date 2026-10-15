import { apiRequest } from './api';
import { getAuthHeaders } from './auth.service';

const withQuery = (path, params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.append(key, value);
  });
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
};

// Người ra đề: phân tích chất lượng câu hỏi thi chính thức. filters: { examId?, topicId? }
// Trả về { success, data: { meta, items } }
export const fetchQuestionAnalysis = (filters = {}) =>
  apiRequest(withQuery('/analytics/questions', filters), { headers: getAuthHeaders() });

// Người duyệt đề: năng lực gộp theo phòng ban. filters: { examId? }
// Trả về { success, data: { minCandidates, departments } }
export const fetchDepartmentCompetency = (filters = {}) =>
  apiRequest(withQuery('/analytics/department-competency', filters), { headers: getAuthHeaders() });

// Người duyệt đề: tỷ lệ thí sinh đã luyện tập theo phòng ban.
// Trả về { success, data: { minCandidates, departments: [{ departmentId, name, candidates, practiced, rate, insufficientData }] } }
export const fetchPracticeReadiness = () =>
  apiRequest('/analytics/practice-readiness', { headers: getAuthHeaders() });

// Người duyệt đề: dấu hiệu bất thường theo từng kỳ thi (gợi ý để xem xét). filters: { examId? }
// Trả về { success, data: { thresholds, exams: [{ examId, title, attempts, sharedWrong, fast }] } }
export const fetchAnomalies = (filters = {}) =>
  apiRequest(withQuery('/analytics/anomalies', filters), { headers: getAuthHeaders() });

// Thí sinh: năng lực của chính mình. Trả về { success, data: { topics, weakest } }
export const fetchMyCompetency = () =>
  apiRequest('/analytics/my-competency', { headers: getAuthHeaders() });