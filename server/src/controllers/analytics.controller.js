/**
 * Controller Phân tích: chất lượng câu hỏi (Người ra đề), năng lực theo phòng ban (Người duyệt đề),
 * năng lực cá nhân (Thí sinh). Chỉ nhận request, gọi service, trả JSON.
 */

import { asyncHandler } from '../utils/async-handler.js';
import { analyticsService } from '../services/analytics.service.js';

export const analyticsController = {
  questions: asyncHandler(async (req, res) => {
    const data = await analyticsService.getQuestionAnalysis({
      examId: req.query.examId,
      topicId: req.query.topicId,
    });
    res.json({ success: true, message: 'OK', code: 'ANALYTICS_QUESTIONS', data });
  }),

  departmentCompetency: asyncHandler(async (req, res) => {
    const data = await analyticsService.getDepartmentCompetency({ examId: req.query.examId });
    res.json({ success: true, message: 'OK', code: 'ANALYTICS_DEPARTMENT_COMPETENCY', data });
  }),

  practiceReadiness: asyncHandler(async (_req, res) => {
    const data = await analyticsService.getPracticeReadiness();
    res.json({ success: true, message: 'OK', code: 'ANALYTICS_PRACTICE_READINESS', data });
  }),

  anomalies: asyncHandler(async (req, res) => {
    const data = await analyticsService.getAnomalies({ examId: req.query.examId });
    res.json({ success: true, message: 'OK', code: 'ANALYTICS_ANOMALIES', data });
  }),

  myCompetency: asyncHandler(async (req, res) => {
    const data = await analyticsService.getMyCompetency(req.auth.userId);
    res.json({ success: true, message: 'OK', code: 'ANALYTICS_MY_COMPETENCY', data });
  }),
};