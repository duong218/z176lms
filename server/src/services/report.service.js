/**
 * Service Báo cáo Thống kê & Xuất Dữ liệu Kết quả Thi (Report Service).
 * Hỗ trợ các thống kê tổng quan, theo phòng ban, theo kỳ thi, tra cứu kết quả công khai và xuất báo cáo Excel định dạng chuyên nghiệp.
 */

import mongoose from 'mongoose';
import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import { Result } from '../models/result.model.js';
import { Employee } from '../models/employee.model.js';

// Pipeline kết nối cơ sở (Base Pipeline): Result -> ExamAttempt -> ExamCandidate -> Employee -> Department -> Exam -> Topic
// Phòng ban của 1 kết quả = phòng ban (vai trò) thí sinh đã thi ở lượt thi đó (ExamAttempt.departmentId); lượt thi cũ chưa có
// trường này thì dùng phòng chính của nhân viên (hành vi trước đây).
const getBasePipeline = () => [
  {
    $lookup: {
      from: 'examattempts',
      localField: 'examAttemptId',
      foreignField: '_id',
      as: 'attempt',
    },
  },
  { $unwind: '$attempt' },
  {
    $lookup: {
      from: 'examcandidates',
      localField: 'attempt.examCandidateId',
      foreignField: '_id',
      as: 'candidate',
    },
  },
  { $unwind: '$candidate' },
  {
    $lookup: {
      from: 'employees',
      localField: 'candidate.employeeId',
      foreignField: '_id',
      as: 'employee',
    },
  },
  { $unwind: '$employee' },
  {
    $addFields: {
      reportDepartmentId: { $ifNull: ['$attempt.departmentId', '$employee.departmentId'] },
    },
  },
  {
    $lookup: {
      from: 'departments',
      localField: 'reportDepartmentId',
      foreignField: '_id',
      as: 'department',
    },
  },
  { $unwind: '$department' },
  {
    $lookup: {
      from: 'exams',
      localField: 'candidate.examId',
      foreignField: '_id',
      as: 'exam',
    },
  },
  { $unwind: '$exam' },
  {
    $lookup: {
      from: 'topics',
      localField: 'exam.topicId',
      foreignField: '_id',
      as: 'topic',
    },
  },
  {
    $unwind: { path: '$topic', preserveNullAndEmptyArrays: true },
  },
];

// Bộ lọc theo CHỦ ĐỀ (tùy chọn): chỉ giữ các kết quả thuộc kỳ thi có exam.topicId = topicId.
// Không truyền topicId -> không lọc (giữ nguyên hành vi cũ). topicId sai định dạng -> trả về rỗng thay vì
// bỏ qua bộ lọc, để không hiển thị nhầm số liệu toàn hệ thống khi người dùng đang xem một chủ đề.
// Phải đặt SAU getBasePipeline() vì cần trường `exam` đã được $lookup.
const topicMatchStages = (topicId) => {
  if (topicId === undefined || topicId === null || topicId === '') return [];
  if (typeof topicId !== 'string' || !mongoose.Types.ObjectId.isValid(topicId)) {
    return [{ $match: { _id: { $in: [] } } }];
  }
  return [{ $match: { 'exam.topicId': new mongoose.Types.ObjectId(topicId) } }];
};

// Hàm phụ trợ escape ký tự đặc biệt trong Regex tránh lỗi Regex Injection
function escapeRegex(str) {
  return String(str ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============ Cấu hình định dạng file Excel (ExcelJS Styling) ============
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008BC5' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
};

// Định dạng hàng tiêu đề bảng Excel
function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = THIN_BORDER;
  });
  row.height = 24;
}

// Định dạng hàng dữ liệu bảng Excel (căn lề và tô màu trạng thái Đạt / Không đạt)
function styleDataRow(row, { centerCols = [], passedCol = null, passedValue = null } = {}) {
  row.eachCell((cell, colNumber) => {
    cell.border = THIN_BORDER;
    cell.alignment = {
      vertical: 'middle',
      horizontal: centerCols.includes(colNumber) ? 'center' : 'left',
    };
  });
  if (passedCol) {
    const cell = row.getCell(passedCol);
    if (passedValue === true || passedValue === 'Đạt') {
      cell.font = { color: { argb: 'FF15803D' }, bold: true };
    } else if (passedValue === false || passedValue === 'Không đạt') {
      cell.font = { color: { argb: 'FFDC2626' }, bold: true };
    }
  }
}

export const reportService = {
  // Lấy các chỉ số thống kê tổng quan toàn hệ thống (Tổng lượt nộp, Thí sinh, Số lượng đạt/hỏng, Điểm TB)
  async getOverviewStats(filters = {}) {
    const pipeline = [
      ...getBasePipeline(),
      ...topicMatchStages(filters.topicId),
      {
        $group: {
          _id: null,
          totalSubmissions: { $sum: 1 },
          passedCount: { $sum: { $cond: ['$passed', 1, 0] } },
          failedCount: { $sum: { $cond: ['$passed', 0, 1] } },
          avgScore: { $avg: '$score' },
          uniqueCandidates: { $addToSet: '$employee._id' },
        },
      },
    ];

    const results = await Result.aggregate(pipeline);
    if (!results || results.length === 0) {
      return {
        totalSubmissions: 0,
        totalCandidates: 0,
        passedCount: 0,
        failedCount: 0,
        passRate: 0,
        avgScore: 0,
      };
    }

    const stats = results[0];
    const totalCandidates = stats.uniqueCandidates.length;
    const passRate = stats.totalSubmissions > 0
      ? (stats.passedCount / stats.totalSubmissions) * 100
      : 0;

    return {
      totalSubmissions: stats.totalSubmissions,
      totalCandidates,
      passedCount: stats.passedCount,
      failedCount: stats.failedCount,
      passRate: Number(passRate.toFixed(2)),
      avgScore: Number(stats.avgScore.toFixed(2)),
    };
  },

  // Thống kê tỷ lệ thi đạt và điểm trung bình theo từng Phòng ban / Đơn vị
  async getResultsByDepartment(filters = {}) {
    const pipeline = [
      ...getBasePipeline(),
      ...topicMatchStages(filters.topicId),
      {
        $group: {
          _id: '$department._id',
          departmentName: { $first: '$department.name' },
          totalSubmissions: { $sum: 1 },
          passedCount: { $sum: { $cond: ['$passed', 1, 0] } },
          avgScore: { $avg: '$score' },
          uniqueCandidates: { $addToSet: '$employee._id' },
        },
      },
      {
        $project: {
          _id: 1,
          departmentName: 1,
          totalSubmissions: 1,
          totalCandidates: { $size: '$uniqueCandidates' },
          passedCount: 1,
          failedCount: { $subtract: ['$totalSubmissions', '$passedCount'] },
          passRate: {
            $cond: [
              { $gt: ['$totalSubmissions', 0] },
              { $multiply: [{ $divide: ['$passedCount', '$totalSubmissions'] }, 100] },
              0,
            ],
          },
          avgScore: 1,
        },
      },
      { $sort: { departmentName: 1 } },
    ];

    const results = await Result.aggregate(pipeline);
    return results.map(r => ({
      ...r,
      passRate: Number(r.passRate.toFixed(2)),
      avgScore: Number(r.avgScore.toFixed(2)),
    }));
  },

  // Thống kê kết quả thi theo từng Bài thi / Kỳ thi và Chủ đề liên kết
  async getResultsByExam() {
    const pipeline = [
      ...getBasePipeline(),
      {
        $group: {
          _id: '$exam._id',
          examTitle: { $first: '$exam.title' },
          topicName: { $first: '$topic.name' },
          totalSubmissions: { $sum: 1 },
          passedCount: { $sum: { $cond: ['$passed', 1, 0] } },
          avgScore: { $avg: '$score' },
          uniqueCandidates: { $addToSet: '$employee._id' },
        },
      },
      {
        $project: {
          _id: 1,
          examTitle: 1,
          topicName: { $ifNull: ['$topicName', 'Chưa gán chủ đề'] },
          totalSubmissions: 1,
          totalCandidates: { $size: '$uniqueCandidates' },
          passedCount: 1,
          failedCount: { $subtract: ['$totalSubmissions', '$passedCount'] },
          passRate: {
            $cond: [
              { $gt: ['$totalSubmissions', 0] },
              { $multiply: [{ $divide: ['$passedCount', '$totalSubmissions'] }, 100] },
              0,
            ],
          },
          avgScore: 1,
        },
      },
      { $sort: { examTitle: 1 } },
    ];

    const results = await Result.aggregate(pipeline);
    return results.map(r => ({
      ...r,
      passRate: Number(r.passRate.toFixed(2)),
      avgScore: Number(r.avgScore.toFixed(2)),
    }));
  },

  // MỚI — Danh sách chủ đề để làm bộ lọc ở tab Tổng quan của Người duyệt đề.
  // Chỉ gồm các chủ đề đã có ít nhất 1 kết quả thi (chọn chủ đề chưa có kết quả thì chỉ ra trang trống).
  async getTopicOptions() {
    const pipeline = [
      ...getBasePipeline(),
      { $match: { 'topic._id': { $exists: true } } },
      {
        $group: {
          _id: '$topic._id',
          name: { $first: '$topic.name' },
          totalSubmissions: { $sum: 1 },
        },
      },
      { $sort: { name: 1 } },
    ];
    return Result.aggregate(pipeline);
  },

  // Lấy tỷ lệ thi đạt theo phòng ban cho Trang chủ Công khai (Không cần đăng nhập, ẩn các thông tin nhạy cảm)
  async getPublicResultsByDepartment() {
    const pipeline = [
      ...getBasePipeline(),
      {
        $group: {
          _id: '$department._id',
          departmentName: { $first: '$department.name' },
          totalSubmissions: { $sum: 1 },
          passedCount: { $sum: { $cond: ['$passed', 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          departmentName: 1,
          totalSubmissions: 1,
          passRate: {
            $cond: [
              { $gt: ['$totalSubmissions', 0] },
              { $multiply: [{ $divide: ['$passedCount', '$totalSubmissions'] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { passRate: -1 } },
    ];

    const results = await Result.aggregate(pipeline);
    return results.map(r => ({ ...r, passRate: Number(r.passRate.toFixed(2)) }));
  },

  // Tra cứu kết quả thi cá nhân công khai theo Họ tên hoặc Mã nhân viên
  async lookupPublicResult(term) {
    const q = String(term ?? '').trim();
    if (!q) return [];

    const escaped = escapeRegex(q);
    const pipeline = [
      ...getBasePipeline(),
      {
        $match: {
          $or: [
            { 'employee.employeeCode': { $regex: `^${escaped}$`, $options: 'i' } },
            // Khớp NGUYÊN họ tên (không tìm theo một phần) để không quét được cả đơn vị bằng "Nguyễn", "Trần"...
            { 'employee.fullname': { $regex: `^${escaped}$`, $options: 'i' } },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 5 }, // giao diện công khai chỉ hiện 5 kết quả gần nhất (MAX_PUBLIC_RESULTS)
    ];

    const data = await Result.aggregate(pipeline);
    return data.map(item => ({
      fullname: item.employee.fullname,
      employeeCode: item.employee.employeeCode || null,
      departmentName: item.department.name,
      score: item.score,
      totalQuestions: item.totalQuestions,
      passed: item.passed,
      submittedAt: item.attempt.submittedAt,
    }));
  },

  // Lấy danh sách kết quả thi chi tiết kèm phân trang và các bộ lọc tìm kiếm
  async getDetailedResults(filters = {}) {
    const matchStage = {};
    if (filters.departmentId) {
      matchStage['department._id'] = new mongoose.Types.ObjectId(filters.departmentId);
    }
    if (filters.passed !== undefined && filters.passed !== '') {
      matchStage['passed'] = filters.passed === 'true';
    }
    if (filters.startDate || filters.endDate) {
      matchStage['createdAt'] = {};
      if (filters.startDate) matchStage['createdAt'].$gte = new Date(filters.startDate);
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        matchStage['createdAt'].$lte = end;
      }
    }
    if (filters.search) {
      matchStage['employee.fullname'] = { $regex: filters.search, $options: 'i' };
    }

    const page = parseInt(filters.page, 10) || 1;
    const limit = parseInt(filters.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const pipeline = [
      ...getBasePipeline(),
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
    ];

    const [data, countResult] = await Promise.all([
      Result.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
      Result.aggregate([...pipeline, { $count: 'total' }]),
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    const formattedData = data.map(item => ({
      _id: item._id,
      examCandidateId: item.candidate._id,
      employeeName: item.employee.fullname,
      // Vai trò (phòng ban) đã thi ở lượt thi này — departmentId giúp màn hình cấp thêm lượt biết thí sinh đang ở vai trò nào
      departmentId: item.department._id,
      departmentName: item.department.name,
      examTitle: item.exam.title,
      score: item.score,
      passed: item.passed,
      submittedAt: item.attempt.submittedAt,
    }));

    return {
      data: formattedData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  },

  // Xuất file Excel bảng kết quả chi tiết
  async exportDetailedResultsExcel(filters = {}) {
    const matchStage = {};
    if (filters.departmentId) {
      matchStage['department._id'] = new mongoose.Types.ObjectId(filters.departmentId);
    }
    if (filters.passed !== undefined && filters.passed !== '') {
      matchStage['passed'] = filters.passed === 'true';
    }
    if (filters.startDate || filters.endDate) {
      matchStage['createdAt'] = {};
      if (filters.startDate) matchStage['createdAt'].$gte = new Date(filters.startDate);
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        matchStage['createdAt'].$lte = end;
      }
    }
    if (filters.search) {
      matchStage['employee.fullname'] = { $regex: filters.search, $options: 'i' };
    }

    const pipeline = [
      ...getBasePipeline(),
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
    ];

    const data = await Result.aggregate(pipeline);

    const worksheetData = data.map((item, index) => ({
      'STT': index + 1,
      'Họ và tên': item.employee.fullname,
      'Phòng ban': item.department.name,
      'Bài thi': item.exam.title,
      'Điểm': item.score,
      'Kết quả': item.passed ? 'Đạt' : 'Không đạt',
      'Ngày nộp': item.attempt.submittedAt ? new Date(item.attempt.submittedAt).toLocaleString('vi-VN') : '',
    }));

    const worksheet = xlsx.utils.json_to_sheet(worksheetData);

    const maxWidths = [5, 25, 20, 30, 10, 15, 20];
    worksheet['!cols'] = maxWidths.map(w => ({ wch: w }));

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Ket_qua_thi');

    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  },

  // Xuất file Excel báo cáo phân loại theo Bài thi (gồm 2 Sheet: Tổng hợp & Chi tiết)
  async exportResultsByExamExcel() {
    const summary = await this.getResultsByExam();

    const pipeline = [...getBasePipeline(), { $sort: { 'exam.title': 1, createdAt: -1 } }];
    const detail = await Result.aggregate(pipeline);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Z176 - He thong thi noi bo';
    workbook.created = new Date();

    // Sheet 1: Tổng hợp số liệu theo từng bài thi
    const sumSheet = workbook.addWorksheet('Tong_hop', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sumSheet.columns = [
      { header: 'Bài thi', key: 'examTitle', width: 32 },
      { header: 'Chủ đề', key: 'topicName', width: 24 },
      { header: 'Số thí sinh', key: 'totalCandidates', width: 12 },
      { header: 'Số lượt nộp', key: 'totalSubmissions', width: 12 },
      { header: 'Đạt', key: 'passedCount', width: 10 },
      { header: 'Không đạt', key: 'failedCount', width: 12 },
      { header: 'Tỷ lệ Đạt (%)', key: 'passRate', width: 14 },
      { header: 'Điểm TB', key: 'avgScore', width: 12 },
    ];
    styleHeaderRow(sumSheet.getRow(1));
    summary.forEach((item) => {
      const row = sumSheet.addRow(item);
      styleDataRow(row, { centerCols: [3, 4, 5, 6, 7, 8] });
      row.getCell('passedCount').font = { color: { argb: 'FF15803D' }, bold: true };
      row.getCell('failedCount').font = { color: { argb: 'FFDC2626' }, bold: true };
    });
    sumSheet.autoFilter = { from: 'A1', to: `H${summary.length + 1}` };

    // Sheet 2: Chi tiết từng lượt nộp bài
    const detailSheet = workbook.addWorksheet('Chi_tiet', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    detailSheet.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Bài thi', key: 'examTitle', width: 30 },
      { header: 'Chủ đề', key: 'topicName', width: 22 },
      { header: 'Họ và tên', key: 'fullname', width: 25 },
      { header: 'Phòng ban', key: 'departmentName', width: 20 },
      { header: 'Điểm', key: 'score', width: 10 },
      { header: 'Kết quả', key: 'passedText', width: 14 },
      { header: 'Ngày nộp', key: 'submittedAt', width: 20 },
    ];
    styleHeaderRow(detailSheet.getRow(1));
    detail.forEach((item, index) => {
      const row = detailSheet.addRow({
        stt: index + 1,
        examTitle: item.exam.title,
        topicName: item.topic?.name || 'Chưa gán chủ đề',
        fullname: item.employee.fullname,
        departmentName: item.department.name,
        score: item.score,
        passedText: item.passed ? 'Đạt' : 'Không đạt',
        submittedAt: item.attempt.submittedAt
          ? new Date(item.attempt.submittedAt).toLocaleString('vi-VN')
          : '',
      });
      styleDataRow(row, {
        centerCols: [1, 6, 7, 8],
        passedCol: 7,
        passedValue: item.passed,
      });
    });
    detailSheet.autoFilter = { from: 'A1', to: `H${detail.length + 1}` };

    return workbook.xlsx.writeBuffer();
  },

  // Xem lịch sử kết quả thi của chính thí sinh đang đăng nhập
  async getMyResults(userId) {
    const employee = await Employee.findOne({ userId })
      .populate('departmentId')
      .populate('extraDepartmentIds', 'name code')
      .lean();

    if (!employee) {
      return { employee: null, results: [] };
    }

    const pipeline = [
      ...getBasePipeline(),
      { $match: { 'employee._id': employee._id } },
      { $sort: { createdAt: -1 } },
    ];

    const data = await Result.aggregate(pipeline);

    const results = data.map((item) => ({
      _id: item._id,
      examId: item.exam._id,
      examTitle: item.exam.title,
      score: item.score,
      correctCount: item.correctCount,
      totalQuestions: item.totalQuestions,
      passed: item.passed,
      submittedAt: item.attempt.submittedAt,
      startedAt: item.attempt.startedAt,
      // Vai trò (phòng ban) đã thi ở lượt thi này
      departmentName: item.department?.name ?? null,
    }));

    return {
      employee: {
        fullname: employee.fullname,
        employeeCode: employee.employeeCode || null,
        departmentName: employee.departmentId?.name || null,
        // Phòng ban kiêm nhiệm: [{ _id, name }] — rỗng nếu nhân viên không kiêm nhiệm
        extraDepartments: (employee.extraDepartmentIds ?? []).map((d) => ({ _id: d._id, name: d.name })),
      },
      results,
    };
  },
};