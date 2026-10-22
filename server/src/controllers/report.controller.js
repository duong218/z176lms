/**
 * Controller Báo cáo & Thống kê Kết quả Thi (Reporting & Analytics).
 * Cung cấp số liệu tổng quan, thống kê theo phòng ban/bài thi, tra cứu kết quả công khai và xuất báo cáo Excel.
 */

import { asyncHandler } from '../utils/async-handler.js';
import { reportService } from '../services/report.service.js';

export const reportController = {
  // Lấy các chỉ số thống kê tổng quan (tổng đề thi, số thí sinh, tỷ lệ đạt)
  getOverviewStats: asyncHandler(async (req, res) => {
    const stats = await reportService.getOverviewStats({ topicId: req.query.topicId });
    res.json({
      success: true,
      data: stats,
    });
  }),

  // Thống kê kết quả thi và tỷ lệ đạt theo từng đơn vị / phòng ban
  getResultsByDepartment: asyncHandler(async (req, res) => {
    const data = await reportService.getResultsByDepartment({ topicId: req.query.topicId });
    res.json({
      success: true,
      data,
    });
  }),

  // MỚI — Danh sách chủ đề có kết quả thi, dùng cho bộ lọc ở tab Tổng quan
  getTopicOptions: asyncHandler(async (req, res) => {
    const data = await reportService.getTopicOptions();
    res.json({
      success: true,
      data,
    });
  }),

  // Danh sách bài thi làm bộ lọc ở tab Kết quả chi tiết
  getExamOptions: asyncHandler(async (req, res) => {
    res.json({ success: true, data: await reportService.getExamOptions() });
  }),

  // Thống kê kết quả thi theo từng Bài thi / Chủ đề chuyên môn
  getResultsByExam: asyncHandler(async (req, res) => {
    const data = await reportService.getResultsByExam();
    res.json({
      success: true,
      data,
    });
  }),

  // Thống kê công khai theo phòng ban dành cho trang chủ (không yêu cầu đăng nhập)
  getPublicResultsByDepartment: asyncHandler(async (req, res) => {
    const data = await reportService.getPublicResultsByDepartment();
    res.json({
      success: true,
      data,
    });
  }),

  // Tra cứu kết quả thi công khai theo Mã nhân viên hoặc Họ tên thí sinh
  lookupPublicResult: asyncHandler(async (req, res) => {
    const data = await reportService.lookupPublicResult(req.query.q);
    res.json({
      success: true,
      data,
    });
  }),

  // Lấy danh sách kết quả thi chi tiết có hỗ trợ lọc (phòng ban, trạng thái đạt/trượt, khoảng thời gian)
  getDetailedResults: asyncHandler(async (req, res) => {
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      departmentId: req.query.departmentId,
      passed: req.query.passed,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search,
      examId: req.query.examId,
    };
    const data = await reportService.getDetailedResults(filters);
    res.json({
      success: true,
      data,
    });
  }),

  // Xuất file Excel báo cáo kết quả thi chi tiết theo danh sách lọc
  exportDetailedResultsExcel: asyncHandler(async (req, res) => {
    const filters = {
      departmentId: req.query.departmentId,
      passed: req.query.passed,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search,
      examId: req.query.examId,
    };
    const buffer = await reportService.exportDetailedResultsExcel(filters);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ket_qua_thi.xlsx"'
    );
    res.send(buffer);
  }),

  // Xuất file Excel bảng điểm tổng hợp và chi tiết phân nhóm theo từng bài thi
  exportResultsByExamExcel: asyncHandler(async (req, res) => {
    const buffer = await reportService.exportResultsByExamExcel();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ket_qua_thi_theo_bai_thi.xlsx"'
    );
    res.send(buffer);
  }),

  // Lấy lịch sử và kết quả tất cả các bài thi của chính thí sinh đang đăng nhập
  getMyResults: asyncHandler(async (req, res) => {
    const data = await reportService.getMyResults(req.auth.userId);
    res.json({
      success: true,
      data,
    });
  }),
};