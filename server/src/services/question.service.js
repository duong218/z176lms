/**
 * Service Quản lý Ngân hàng Câu hỏi & Import Excel (Question Service).
 * Xử lý: CRUD câu hỏi & đáp án, Upload/Xóa ảnh Cloudinary với băm SHA-256 chống trùng lặp, Preview & Xác nhận Import Excel thông minh, và Thống kê cơ cấu câu hỏi.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import mammoth from 'mammoth';
import { v2 as cloudinary } from 'cloudinary';
import {
  ANSWER_TYPE,
  DIFFICULTY,
  QUESTION_KIND,
  QUESTION_SCOPE,
  EXAM_STATUS,
  Answer,
  Question,
  Department,
  Exam,
  Employee,
} from '../models/index.js';
import { QUESTION_USAGE } from '../models/constants.js';
import { questionUsageFilter } from '../models/question.model.js';
import { ApiError, assertFound } from '../utils/api-error.js';
import { findDepartmentByCode, findOrCreateDepartmentByName, upsertDepartmentForImport } from './department.service.js';
import { normalizeDeptName } from '../models/department.model.js';
import { findOrCreateTopicByName } from './topic.service.js';
import { env } from '../config/env.js';

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

const CLOUDINARY_QUESTION_FOLDER = 'z176/questions';

// Stream upload buffer ảnh lên Cloudinary
function uploadBufferToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, overwrite: true, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

// Upload ảnh câu hỏi lên Cloudinary (Đặt public_id theo mã băm SHA-256 để chống trùng lặp bộ nhớ)
export async function uploadQuestionImageBuffer(buffer) {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const publicId = `${CLOUDINARY_QUESTION_FOLDER}/${hash}`;
  const result = await uploadBufferToCloudinary(buffer, publicId);
  return { imageUrl: result.secure_url, imageCloudinaryId: result.public_id };
}

// Xóa ảnh câu hỏi trên Cloudinary theo public_id
async function deleteQuestionImage(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.error('Cloudinary destroy thất bại:', publicId, err.message);
  }
}

// Chuẩn hóa chuỗi tiêu đề cột Excel (chuyển chữ thường, bỏ dấu tiếng Việt và ký tự đặc biệt)
function normalizeKey(key) {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '');
}

// Chuẩn hóa nội dung văn bản câu hỏi phục vụ kiểm tra trùng lặp dữ liệu import
function normalizeContentForDedupe(content) {
  return String(content ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// Xây dựng map ánh xạ enum từ nhiều biến thể nhập liệu khác nhau sang giá trị chuẩn
function buildNormalizedMap(pairs) {
  const out = {};
  for (const [rawKeys, value] of pairs) {
    for (const k of rawKeys) {
      out[normalizeKey(k)] = value;
    }
  }
  return out;
}

const DIFFICULTY_MAP = buildNormalizedMap([
  [['easy', 'dễ', 'de'], DIFFICULTY.EASY],
  [['medium', 'trung bình', 'trung binh', 'tb'], DIFFICULTY.MEDIUM],
  [['hard', 'khó', 'kho'], DIFFICULTY.HARD],
]);

const KIND_MAP = buildNormalizedMap([
  [['theory', 'lý thuyết', 'ly thuyet'], QUESTION_KIND.THEORY],
  [['practice', 'bài tập', 'bai tap'], QUESTION_KIND.PRACTICE],
]);

const ANSWER_TYPE_MAP = buildNormalizedMap([
  [['single', 'single choice', 'chọn 1', 'chon 1'], ANSWER_TYPE.SINGLE],
  [['multiple', 'multiple choice', 'chọn nhiều', 'chon nhieu'], ANSWER_TYPE.MULTIPLE],
]);

const SCOPE_MAP = buildNormalizedMap([
  [['common', 'chung'], QUESTION_SCOPE.COMMON],
  [['departmentspecific', 'department', 'riêng', 'rieng'], QUESTION_SCOPE.DEPARTMENT_SPECIFIC],
]);

// Chuẩn hóa tên toàn bộ các thuộc tính (keys) của một dòng Excel
function mapRowKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normalizeKey(k)] = v;
  }
  return out;
}

// Parse danh sách chỉ số đáp án đúng từ chuỗi nhập liệu (hỗ trợ phân tách bằng dấu phẩy, chấm phẩy, xuyệt)
function parseCorrectIndices(raw) {
  if (raw == null || raw === '') return [];
  const s = String(raw).trim();
  const parts = s.split(/[,;|/]/).map((p) => p.trim()).filter(Boolean);
  const indices = [];
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (!Number.isNaN(n) && n >= 1) {
      indices.push(n);
    }
  }
  return [...new Set(indices)];
}

// Kiểm tra tính hợp lệ của tập hợp phương án trả lời (Số lượng tối thiểu, số đáp án đúng theo Single / Multiple)
export function validateAnswerSet(answerType, answers) {
  if (!Array.isArray(answers) || answers.length < 2) {
    throw new ApiError(400, 'Cần ít nhất 2 phương án trả lời', 'QUESTION_ANSWERS_MIN');
  }
  const correct = answers.filter((a) => a.isCorrect);
  if (answerType === ANSWER_TYPE.SINGLE && correct.length !== 1) {
    throw new ApiError(400, 'Câu single choice cần đúng 1 đáp án đúng', 'QUESTION_SINGLE_CORRECT');
  }
  if (answerType === ANSWER_TYPE.MULTIPLE && correct.length < 1) {
    throw new ApiError(400, 'Câu multiple choice cần ít nhất 1 đáp án đúng', 'QUESTION_MULTI_CORRECT');
  }
}

// Kiểm tra giá trị usage (thi chính thức / ôn tập).
// required = true: thiếu là lỗi (dùng cho import để không bao giờ tự đoán ngân hàng đích).
export function parseUsage(raw, { required = false } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    if (required) {
      throw new ApiError(
        400,
        'Vui lòng chọn nhập vào ngân hàng thi chính thức hay ngân hàng ôn tập',
        'QUESTION_USAGE_REQUIRED',
      );
    }
    return undefined;
  }
  if (!Object.values(QUESTION_USAGE).includes(raw)) {
    throw new ApiError(400, 'usage không hợp lệ', 'QUESTION_VALIDATION');
  }
  return raw;
}

// Serialize câu hỏi và danh sách đáp án sang định dạng JSON hoàn chỉnh
function serializeQuestion(doc, answers) {
  return {
    id: doc._id.toString(),
    content: doc.content,
    questionKind: doc.questionKind,
    answerType: doc.answerType,
    difficulty: doc.difficulty,
    scope: doc.scope,
    // Dữ liệu cũ chưa có trường usage được coi là câu thi chính thức
    usage: doc.usage ?? QUESTION_USAGE.EXAM,
    topicId: doc.topicId?.toString(),
    departmentId: doc.departmentId?.toString(),
    imageUrl: doc.imageUrl,
    imageCloudinaryId: doc.imageCloudinaryId,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    answers: answers.map((a) => ({
      id: a._id.toString(),
      content: a.content,
      isCorrect: a.isCorrect,
      sortOrder: a.sortOrder,
    })),
  };
}

// Dựng truy vấn lọc câu hỏi theo nhiều tiêu chí
function buildQuestionQuery(filters = {}) {
  const { topicId, scope, departmentId, questionKind, difficulty, answerType, usage, isActive = true, search } = filters;
  const query = {};
  if (isActive !== undefined && isActive !== 'all') {
    query.isActive = isActive === true || isActive === 'true';
  }
  if (topicId) query.topicId = topicId;
  if (scope) query.scope = scope;
  if (departmentId) query.departmentId = departmentId;
  if (questionKind) query.questionKind = questionKind;
  if (difficulty) query.difficulty = difficulty;
  if (answerType) query.answerType = answerType;
  const usageValue = parseUsage(usage);
  if (usageValue) Object.assign(query, questionUsageFilter(usageValue));
  if (search?.trim()) {
    query.content = { $regex: search.trim(), $options: 'i' };
  }
  return query;
}

// Lấy danh sách câu hỏi kèm phân trang và nạp danh sách đáp án
export async function listQuestions(filters = {}) {
  const { page = 1, limit = 20 } = filters;
  const query = buildQuestionQuery(filters);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  // Số câu theo từng ngân hàng (áp các bộ lọc khác, bỏ lọc usage) để hiện trên các nút lọc
  const countBase = buildQuestionQuery({ ...filters, usage: undefined });

  const [items, total, examCount, practiceCount] = await Promise.all([
    Question.find(query).sort({ updatedAt: -1 }).skip(skip).limit(safeLimit).lean(),
    Question.countDocuments(query),
    Question.countDocuments({ ...countBase, ...questionUsageFilter(QUESTION_USAGE.EXAM) }),
    Question.countDocuments({ ...countBase, ...questionUsageFilter(QUESTION_USAGE.PRACTICE) }),
  ]);

  const ids = items.map((q) => q._id);
  const answers = await Answer.find({ questionId: { $in: ids } }).sort({ sortOrder: 1 }).lean();
  const byQuestion = new Map();
  for (const a of answers) {
    const key = a.questionId.toString();
    if (!byQuestion.has(key)) byQuestion.set(key, []);
    byQuestion.get(key).push(a);
  }

  return {
    items: items.map((q) => serializeQuestion(q, byQuestion.get(q._id.toString()) ?? [])),
    pagination: { page: safePage, limit: safeLimit, total },
    usageCounts: { exam: examCount, practice: practiceCount },
  };
}

// Lấy chi tiết một câu hỏi theo ID
export async function getQuestionById(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, 'ID câu hỏi không hợp lệ', 'QUESTION_ID_INVALID');
  }
  const question = await Question.findById(id);
  assertFound(question, 'Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');
  const answers = await Answer.find({ questionId: question._id }).sort({ sortOrder: 1 });
  return serializeQuestion(question, answers);
}

// Ghi đè toàn bộ danh sách đáp án của một câu hỏi
async function replaceAnswers(questionId, answersInput) {
  await Answer.deleteMany({ questionId });
  const toInsert = answersInput.map((a, index) => ({
    questionId,
    content: a.content.trim(),
    isCorrect: Boolean(a.isCorrect),
    sortOrder: a.sortOrder ?? index,
  }));
  await Answer.insertMany(toInsert);
}


// Tạo mới một câu hỏi kèm các đáp án lựa chọn
export async function createQuestion(payload, createdBy) {
  const {
    content,
    questionKind,
    answerType,
    difficulty,
    scope,
    topicId,
    departmentId,
    imageUrl,
    imageCloudinaryId,
    answers,
    usage,
  } = payload;

  if (!content?.trim()) {
    throw new ApiError(400, 'Nội dung câu hỏi là bắt buộc', 'QUESTION_VALIDATION');
  }
  if (!topicId) {
    throw new ApiError(400, 'topicId là bắt buộc', 'QUESTION_VALIDATION');
  }

  validateAnswerSet(answerType, answers);
  // Không gửi usage thì mặc định là câu thi chính thức (giữ đúng hành vi cũ)
  const usageValue = parseUsage(usage) ?? QUESTION_USAGE.EXAM;

  const question = await Question.create({
    content: content.trim(),
    questionKind,
    answerType,
    difficulty,
    scope,
    usage: usageValue,
    topicId,
    departmentId: scope === QUESTION_SCOPE.DEPARTMENT_SPECIFIC ? departmentId : undefined,
    imageUrl,
    imageCloudinaryId,
    createdBy,
  });

  await replaceAnswers(question._id, answers);
  return getQuestionById(question._id);
}

// Cập nhật thông tin câu hỏi, đáp án và đồng bộ xóa ảnh cũ trên Cloudinary
export async function updateQuestion(id, payload, actorUserId, ipAddress) {
  const question = await Question.findById(id);
  assertFound(question, 'Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');

  const previousCloudinaryId = question.imageCloudinaryId;
  const previousUsage = question.usage ?? QUESTION_USAGE.EXAM;
  if (payload.usage !== undefined) parseUsage(payload.usage);

  const fields = [
    'content',
    'questionKind',
    'answerType',
    'difficulty',
    'scope',
    'topicId',
    'departmentId',
    'imageUrl',
    'imageCloudinaryId',
    'usage',
    'isActive',
  ];
  for (const f of fields) {
    if (payload[f] !== undefined) question[f] = payload[f];
  }
  if (question.scope === QUESTION_SCOPE.COMMON) {
    question.departmentId = undefined;
  }

  if (payload.answers) {
    validateAnswerSet(question.answerType, payload.answers);
  }

  // Chuyển câu từ THI sang ÔN TẬP sẽ lộ đáp án cho thí sinh: chặn nếu chủ đề đang có kỳ thi phát hành
  // (cùng quy tắc với việc ngừng sử dụng câu hỏi)
  const nextUsage = question.usage ?? QUESTION_USAGE.EXAM;
  if (nextUsage === QUESTION_USAGE.PRACTICE && previousUsage !== QUESTION_USAGE.PRACTICE) {
    const activeExam = await findActiveExamUsingTopics([question.topicId]);
    if (activeExam) {
      throw new ApiError(
        409,
        `Không thể chuyển câu hỏi này sang Ôn tập vì chủ đề của câu hỏi đang được dùng cho kỳ thi "${activeExam.title}" đang diễn ra (câu có thể đã nằm trong mã đề). Vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
        'QUESTION_USAGE_ACTIVE_EXAM',
      );
    }
  }

  await question.save();

  if (payload.answers) {
    await replaceAnswers(question._id, payload.answers);
  }

  if (
    payload.imageCloudinaryId !== undefined &&
    previousCloudinaryId &&
    previousCloudinaryId !== question.imageCloudinaryId
  ) {
    await deleteQuestionImage(previousCloudinaryId);
  }

  return getQuestionById(question._id);
}

// Kiểm tra xem có kỳ thi PUBLISHED nào đang sử dụng các chủ đề này không
async function findActiveExamUsingTopics(topicIds) {
  const ids = [...new Set(topicIds.filter(Boolean).map((id) => id.toString()))];
  if (ids.length === 0) return null;
  return Exam.findOne({ topicId: { $in: ids }, status: EXAM_STATUS.PUBLISHED });
}

// Ngừng kích hoạt (xóa mềm) một câu hỏi (chặn nếu thuộc chủ đề có kỳ thi đang mở)
export async function deactivateQuestion(id, actorUserId, ipAddress) {
  const question = await Question.findById(id);
  assertFound(question, 'Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');

  const activeExam = await findActiveExamUsingTopics([question.topicId]);
  if (activeExam) {
    throw new ApiError(
      409,
      `Không thể ngừng sử dụng câu hỏi này vì chủ đề của câu hỏi đang được dùng cho kỳ thi "${activeExam.title}" đang diễn ra (áp dụng cho toàn bộ câu hỏi trong chủ đề, kể cả câu chưa được đưa vào đề). Vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
      'QUESTION_HAS_ACTIVE_EXAM',
    );
  }

  question.isActive = false;
  await question.save();

  return { id: question._id.toString(), isActive: false };
}

// Chuyển hàng loạt câu hỏi giữa ngân hàng THI CHÍNH THỨC và ÔN TẬP (theo danh sách IDs hoặc theo Bộ lọc hiện tại).
// - Chỉ chuyển các câu đang nằm ở ngân hàng nguồn; câu đã ở ngân hàng đích được bỏ qua.
// - Sang ÔN TẬP sẽ lộ đáp án cho thí sinh: giống updateQuestion, CHẶN CẢ THAO TÁC (409) nếu bất kỳ câu nào khớp
//   thuộc chủ đề đang có kỳ thi phát hành (PUBLISHED) — không chuyển một phần, phải đợi kỳ thi kết thúc.
// - Chuyển theo bộ lọc bắt buộc có ít nhất 1 bộ lọc cụ thể (giống xóa hàng loạt) để tránh chuyển nhầm toàn bộ ngân hàng.
export async function moveQuestionsUsage({ ids, filters, targetUsage } = {}) {
  const target = parseUsage(targetUsage, { required: true });
  const source = target === QUESTION_USAGE.PRACTICE ? QUESTION_USAGE.EXAM : QUESTION_USAGE.PRACTICE;

  let query;
  if (Array.isArray(ids) && ids.length > 0) {
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      throw new ApiError(400, 'Danh sách ID không hợp lệ', 'QUESTION_BULK_MOVE_INVALID_IDS');
    }
    query = { _id: { $in: validIds }, isActive: true };
  } else if (filters && typeof filters === 'object') {
    const hasSpecificFilter = ['topicId', 'scope', 'departmentId', 'questionKind', 'difficulty', 'answerType', 'search']
      .some((k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== '');
    if (!hasSpecificFilter) {
      throw new ApiError(
        400,
        'Vui lòng chọn ít nhất 1 bộ lọc (chủ đề, phạm vi, bộ phận, độ khó...) trước khi chuyển tất cả, để tránh chuyển nhầm toàn bộ ngân hàng câu hỏi.',
        'QUESTION_BULK_MOVE_NO_FILTER',
      );
    }
    query = buildQuestionQuery({ ...filters, isActive: true });
  } else {
    throw new ApiError(400, 'Thiếu ids hoặc filters để chuyển hàng loạt', 'QUESTION_BULK_MOVE_MISSING_PARAMS');
  }

  // Chỉ lấy câu đang ở ngân hàng nguồn (ghi đè điều kiện usage nếu bộ lọc có)
  Object.assign(query, questionUsageFilter(source));

  const matched = await Question.find(query).select('topicId').lean();
  if (matched.length === 0) {
    return { targetUsage: target, movedCount: 0, questionIds: [] };
  }

  // Chuyển sang ÔN TẬP: chặn toàn bộ nếu có câu thuộc chủ đề đang có kỳ thi PUBLISHED
  if (target === QUESTION_USAGE.PRACTICE) {
    const topicIds = [...new Set(matched.map((q) => q.topicId?.toString()).filter(Boolean))];
    const activeExams = await Exam.find({ topicId: { $in: topicIds }, status: EXAM_STATUS.PUBLISHED })
      .select('topicId title')
      .lean();
    if (activeExams.length > 0) {
      const blockedTopicIds = new Set(activeExams.map((e) => e.topicId.toString()));
      const blockedCount = matched.filter((q) => blockedTopicIds.has(q.topicId?.toString())).length;
      const examTitles = [...new Set(activeExams.map((e) => e.title))].join('", "');
      throw new ApiError(
        409,
        `Không thể chuyển sang Ôn tập vì ${blockedCount} câu thuộc chủ đề đang được dùng cho kỳ thi "${examTitles}" đang diễn ra (chuyển sang Ôn tập sẽ lộ đáp án cho thí sinh). Vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
        'QUESTION_USAGE_ACTIVE_EXAM',
      );
    }
  }

  await Question.updateMany({ _id: { $in: matched.map((q) => q._id) } }, { $set: { usage: target } });

  return {
    targetUsage: target,
    movedCount: matched.length,
    questionIds: matched.map((q) => q._id.toString()),
  };
}

// Xóa mềm hàng loạt câu hỏi (theo danh sách IDs hoặc theo Bộ lọc hiện tại)
export async function deactivateManyQuestions({ ids, filters } = {}, actorUserId, ipAddress) {
  let query;
  if (Array.isArray(ids) && ids.length > 0) {
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      throw new ApiError(400, 'Danh sách ID không hợp lệ', 'QUESTION_BULK_DELETE_INVALID_IDS');
    }
    query = { _id: { $in: validIds }, isActive: true };
  } else if (filters && typeof filters === 'object') {
    const hasSpecificFilter = ['topicId', 'scope', 'departmentId', 'questionKind', 'difficulty', 'answerType', 'search']
      .some((k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== '');
    if (!hasSpecificFilter) {
      throw new ApiError(
        400,
        'Vui lòng chọn ít nhất 1 bộ lọc (chủ đề, phạm vi, bộ phận, độ khó...) trước khi xóa tất cả, để tránh xóa nhầm toàn bộ ngân hàng câu hỏi.',
        'QUESTION_BULK_DELETE_NO_FILTER',
      );
    }
    query = buildQuestionQuery({ ...filters, isActive: true });
  } else {
    throw new ApiError(400, 'Thiếu ids hoặc filters để xóa hàng loạt', 'QUESTION_BULK_DELETE_MISSING_PARAMS');
  }

  const matched = await Question.find(query).select('topicId').lean();
  if (matched.length === 0) {
    return { deactivatedCount: 0, questionIds: [], skippedActiveExam: null };
  }

  const topicIds = [...new Set(matched.map((q) => q.topicId?.toString()).filter(Boolean))];
  const activeExams = await Exam.find({ topicId: { $in: topicIds }, status: EXAM_STATUS.PUBLISHED })
    .select('topicId title')
    .lean();

  const blockedTopicIds = new Set(activeExams.map((e) => e.topicId.toString()));
  const blocked = matched.filter((q) => blockedTopicIds.has(q.topicId?.toString()));
  const idsToDeactivate = matched
    .filter((q) => !blockedTopicIds.has(q.topicId?.toString()))
    .map((q) => q._id);

  if (idsToDeactivate.length > 0) {
    await Question.updateMany({ _id: { $in: idsToDeactivate } }, { $set: { isActive: false } });
  }

  return {
    deactivatedCount: idsToDeactivate.length,
    questionIds: idsToDeactivate.map((id) => id.toString()),
    skippedActiveExam:
      blocked.length > 0
        ? { examTitle: activeExams.map((e) => e.title).join(', '), skippedCount: blocked.length }
        : null,
  };
}

// Ánh xạ giá trị text từ Excel sang hằng số Enum tương ứng
function resolveEnum(map, raw, fieldLabel) {
  const key = normalizeKey(raw);
  const val = map[key];
  if (!val) {
    throw new ApiError(400, `Giá trị không hợp lệ: ${fieldLabel}`, 'IMPORT_ROW_INVALID');
  }
  return val;
}

// Đọc bộ phận của 1 dòng import (r = dòng đã chuẩn hóa key) cho câu Riêng.
// Phòng ban xác định theo MÃ (khóa chính); tên chỉ để đọc cho dễ — tránh tạo trùng phòng do lệch tên.
// Excel: cột "Mã bộ phận" (+ "Bộ phận" là tên). Word: ô "bộ phận" chính là mã (không có tên).
export function readImportDepartmentRef(r, rowIndex) {
  const code = String(r.mabophan ?? r.maboph ?? r.deptcode ?? '').trim();
  if (!code) {
    throw new ApiError(
      400,
      `Dòng ${rowIndex}: câu thuộc phạm vi Riêng phải ghi mã bộ phận`,
      'IMPORT_ROW_INVALID',
    );
  }
  return {
    code,
    name: String(r.department ?? r.bophan ?? r.bophanname ?? '').trim(),
    description: String(r.motabophan ?? r.mota ?? r.deptdescription ?? '').trim(),
  };
}

// Lỗi khi mã bộ phận chưa có trong hệ thống.
// Có cả tên + mã (Excel) -> IMPORT_DEPARTMENT_NOT_FOUND, đi vào luồng "tạo bộ phận mới" ở bước preview.
// Chỉ có mã (Word) -> IMPORT_DEPARTMENT_CODE_UNKNOWN: báo lỗi dòng đó, không tự tạo phòng từ phía người tạo đề.
export function buildImportDepartmentNotFound(rowIndex, { code, name, description }) {
  if (!name) {
    return new ApiError(
      400,
      `Dòng ${rowIndex}: không tìm thấy bộ phận có mã "${code}" — kiểm tra lại mã, hoặc nhờ quản trị viên tạo bộ phận trước`,
      'IMPORT_DEPARTMENT_CODE_UNKNOWN',
    );
  }
  const err = new ApiError(
    400,
    `Dòng ${rowIndex}: không tìm thấy bộ phận có mã "${code}" ("${name}")`,
    'IMPORT_DEPARTMENT_NOT_FOUND',
  );
  err.departmentName = name;
  err.departmentCode = code;
  err.departmentDescription = description;
  return err;
}

// Xử lý đọc & parse dữ liệu của 1 dòng Excel thành object câu hỏi hoàn chỉnh
async function buildQuestionFromImportRow(row, rowIndex) {
  const r = mapRowKeys(row);
  const topicName = r.topic ?? r.chude ?? r.chudelon ?? r.topicname;
  const content = r.content ?? r.noidung ?? r.cauhoi;
  if (!topicName || !content) {
    throw new ApiError(
      400,
      `Dòng ${rowIndex}: thiếu chủ đề hoặc nội dung câu hỏi`,
      'IMPORT_ROW_INVALID',
    );
  }

  const topic = await findOrCreateTopicByName(String(topicName));

  const scope = resolveEnum(SCOPE_MAP, r.scope ?? r.phamvi ?? 'common', 'scope');
  let departmentId;
  if (scope === QUESTION_SCOPE.DEPARTMENT_SPECIFIC) {
    const ref = readImportDepartmentRef(r, rowIndex);
    const dept = await findDepartmentByCode(ref.code);
    if (!dept) throw buildImportDepartmentNotFound(rowIndex, ref);
    departmentId = dept._id;
  }

  const questionKind = resolveEnum(
    KIND_MAP,
    r.questionkind ?? r.loai ?? r.kind ?? 'theory',
    'questionKind',
  );
  const answerType = resolveEnum(
    ANSWER_TYPE_MAP,
    r.answertype ?? r.dapan ?? r.answer_type ?? 'single',
    'answerType',
  );
  const difficulty = resolveEnum(
    DIFFICULTY_MAP,
    r.difficulty ?? r.dokho ?? 'medium',
    'difficulty',
  );

  const options = [];
  for (let i = 1; i <= 8; i += 1) {
    const key = `option${i}`;
    const alt = `luachon${i}`;
    const val = r[key] ?? r[alt];
    if (val != null && String(val).trim() !== '') {
      options.push({ index: i, content: String(val).trim() });
    }
  }
  if (options.length < 2) {
    throw new ApiError(400, `Dòng ${rowIndex}: cần ít nhất 2 phương án`, 'IMPORT_ROW_INVALID');
  }

  const correctRaw = r.correct ?? r.dapanung ?? r.correctoptions ?? r.dapandung;
  const correctIndices = parseCorrectIndices(correctRaw);
  if (correctIndices.length === 0) {
    throw new ApiError(400, `Dòng ${rowIndex}: thiếu đáp án đúng (correct)`, 'IMPORT_ROW_INVALID');
  }

  const answers = options.map((o) => ({
    content: o.content,
    isCorrect: correctIndices.includes(o.index),
    sortOrder: o.index - 1,
  }));

  validateAnswerSet(answerType, answers);

  return {
    content: String(content).trim(),
    questionKind,
    answerType,
    difficulty,
    scope,
    topicId: topic._id,
    departmentId,
    answers,
  };
}

// Đọc toàn bộ các dòng dữ liệu từ file Excel
function readImportRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new ApiError(400, 'Không đọc được file upload', 'IMPORT_FILE_MISSING');
  }

  let workbook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: false });
  } catch (err) {
    throw new ApiError(
      400,
      'File không đúng định dạng Excel hoặc đã bị hỏng. Vui lòng kiểm tra lại file (.xlsx) và tải lên lại.',
      'IMPORT_INVALID_FORMAT',
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new ApiError(400, 'File Excel không có sheet', 'IMPORT_EMPTY');
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rows.length) {
    throw new ApiError(400, 'Sheet trống', 'IMPORT_EMPTY');
  }
  return rows;
}

// Nạp tập hợp các khóa định danh câu hỏi đã tồn tại trong DB để check trùng lặp
// Chỉ so trùng trong CÙNG ngân hàng (thi chính thức / ôn tập)
async function loadSeenKeys(usage) {
  const existingQuestions = await Question.find(
    { isActive: true, ...questionUsageFilter(usage) },
    'content topicId scope departmentId',
  ).lean();
  return new Set(
    existingQuestions.map((q) =>
      [
        q.topicId?.toString() ?? '',
        q.scope,
        q.departmentId?.toString() ?? '',
        normalizeContentForDedupe(q.content),
      ].join('|'),
    ),
  );
}

// Sinh chuỗi khóa định danh cho câu hỏi
function buildDedupeKey(payload) {
  return [
    payload.topicId?.toString() ?? '',
    payload.scope,
    payload.departmentId?.toString() ?? '',
    normalizeContentForDedupe(payload.content),
  ].join('|');
}

// Xác thực và lấy đường dẫn file tạm theo Token upload
function resolveImportTokenPath(token) {
  const safe = path.basename(String(token ?? ''));
  if (!safe || safe !== token) {
    throw new ApiError(400, 'Token import không hợp lệ', 'IMPORT_TOKEN_INVALID');
  }
  return path.join(path.resolve(env.uploadDir), safe);
}

// Bước 1: Xem trước (Preview) Import Excel: Phân tích các dòng hợp lệ, dòng trùng lặp, thiếu phòng ban và dòng lỗi
export async function previewImportQuestionsFromExcelFile(filePath, usage) {
  // Bắt buộc chọn ngân hàng đích trước khi import. Thiếu/sai thì xóa file tạm rồi báo lỗi
  let usageValue;
  try {
    usageValue = parseUsage(usage, { required: true });
  } catch (err) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore cleanup */
    }
    throw err;
  }

  const rows = readImportRows(filePath);
  const seenKeys = await loadSeenKeys(usageValue);

  const ready = [];
  const duplicates = [];
  const errors = [];
  const missingDepts = new Map();

  for (let i = 0; i < rows.length; i += 1) {
    const rowIndex = i + 2;
    try {
      const payload = await buildQuestionFromImportRow(rows[i], rowIndex);
      const dedupeKey = buildDedupeKey(payload);
      if (seenKeys.has(dedupeKey)) {
        duplicates.push({ row: rowIndex, content: payload.content.slice(0, 120) });
      } else {
        seenKeys.add(dedupeKey);
        ready.push({ row: rowIndex, content: payload.content.slice(0, 120) });
      }
    } catch (err) {
      if (err.code === 'IMPORT_DEPARTMENT_NOT_FOUND') {
        const key = normalizeDeptName(err.departmentName);
        const entry = missingDepts.get(key) ?? {
          name: err.departmentName,
          code: '',
          description: '',
          rowCount: 0,
        };
        entry.rowCount += 1;
        if (!entry.code && err.departmentCode) entry.code = err.departmentCode;
        if (!entry.description && err.departmentDescription) entry.description = err.departmentDescription;
        missingDepts.set(key, entry);
      }
      errors.push({
        row: rowIndex,
        message: err.message ?? 'Lỗi không xác định',
        code: err.code ?? 'IMPORT_ROW_ERROR',
      });
    }
  }

  return {
    token: path.basename(filePath),
    usage: usageValue,
    totalRows: rows.length,
    readyCount: ready.length,
    duplicateCount: duplicates.length,
    errorCount: errors.length,
    missingDepartments: [...missingDepts.values()],
    duplicates,
    ready,
    errors,
  };
}

// Bước 2: Xác nhận (Confirm) Import Excel vào CSDL và tự động tạo phòng ban mới nếu được chọn
export async function confirmImportQuestions(token, options, createdBy, actorUserId, ipAddress) {
  const { createDepartments = [], keepDuplicateRows = [], usage } = options ?? {};
  const usageValue = parseUsage(usage, { required: true });
  const filePath = resolveImportTokenPath(token);
  if (!fs.existsSync(filePath)) {
    throw new ApiError(
      400,
      'Phiên import đã hết hạn hoặc đã được xử lý, vui lòng tải file lên lại',
      'IMPORT_TOKEN_EXPIRED',
    );
  }

  for (const dept of createDepartments) {
    const name = dept?.name?.trim();
    if (!name) continue;

    const code = dept?.code?.trim();
    if (!code) {
      throw new ApiError(
        400,
        `Vui lòng nhập mã bộ phận cho "${name}" trước khi import, hoặc bỏ tick "Tạo bộ phận mới" để bỏ qua các câu hỏi riêng của bộ phận này.`,
        'IMPORT_DEPARTMENT_CODE_REQUIRED',
      );
    }

    try {
      await upsertDepartmentForImport({ name, code, description: dept?.description });
    } catch (err) {
      throw err;
    }
  }

  const rows = readImportRows(filePath);
  const seenKeys = await loadSeenKeys(usageValue);
  const keepSet = new Set(keepDuplicateRows);

  const created = [];
  const errors = [];
  const skippedDuplicates = [];

  for (let i = 0; i < rows.length; i += 1) {
    const rowIndex = i + 2;
    try {
      const payload = await buildQuestionFromImportRow(rows[i], rowIndex);
      const dedupeKey = buildDedupeKey(payload);

      if (seenKeys.has(dedupeKey) && !keepSet.has(rowIndex)) {
        skippedDuplicates.push({ row: rowIndex, content: payload.content.slice(0, 80) });
        continue;
      }

      const question = await Question.create({
        content: payload.content,
        questionKind: payload.questionKind,
        answerType: payload.answerType,
        difficulty: payload.difficulty,
        scope: payload.scope,
        usage: usageValue,
        topicId: payload.topicId,
        departmentId: payload.departmentId,
        createdBy,
      });
      await replaceAnswers(question._id, payload.answers);
      created.push(question._id.toString());
      seenKeys.add(dedupeKey);
    } catch (err) {
      errors.push({
        row: rowIndex,
        message: err.message ?? 'Lỗi không xác định',
        code: err.code ?? 'IMPORT_ROW_ERROR',
      });
    }
  }

  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore cleanup */
  }

  return {
    usage: usageValue,
    imported: created.length,
    failed: errors.length,
    skipped: skippedDuplicates.length,
    errors,
    skippedDuplicates,
    questionIds: created,
  };
}

// ============================================================================
// IMPORT TỪ FILE WORD (.docx) — tái sử dụng buildQuestionFromImportRow /
// loadSeenKeys / buildDedupeKey / resolveImportTokenPath của luồng Excel.
// Khuôn mẫu bắt buộc (xác nhận với BA ngày hiện tại):
//   Câu 1: (chủ đề: xxxxx - bộ phận: xxxxx - độ khó: xxxxx) Nội dung câu hỏi?
//   A. Phương án 1
//   *B. Phương án đúng (đánh dấu bằng dấu * ở đầu)
//   C. Phương án 3
//   D. Phương án đúng khác (đánh dấu bằng cách GẠCH CHÂN toàn bộ dòng)
//   - Bộ phận để trống -> Phạm vi Chung; có ghi bộ phận -> Phạm vi Riêng.
//   - Ô "bộ phận" ghi MÃ bộ phận (vd: HCHC), không ghi tên. Mã không tồn tại -> báo lỗi dòng đó (Word không tự tạo phòng).
//   - Cho phép cả 2 cách đánh dấu (*, gạch chân) trong cùng 1 file. Cách nào
//     xuất hiện NHIỀU hơn trong toàn file được coi là "cách chính". Câu nào
//     chỉ đánh dấu theo cách còn lại (thiểu số) sẽ bị đưa vào needsReview để
//     người ra đề xác nhận lại ở bước preview trước khi ghi vào CSDL.
// ============================================================================

// Bóc tách text thuần từ 1 đoạn HTML do mammoth trả về (bỏ thẻ, giải mã entity cơ bản)
function stripHtmlToText(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00A0/g, ' ')
    .trim();
}

// Giải mã entity HTML cơ bản cho 1 đoạn text (không trim). &amp; giải mã SAU CÙNG
// để chuỗi như "&amp;lt;" không bị giải mã 2 lần.
function decodeBasicEntities(str) {
  return String(str ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/&amp;/g, '&');
}

// Tách 1 đoạn HTML của mammoth thành mảng ký tự, mỗi ký tự kèm cờ u = đang nằm
// trong thẻ <u>...</u> hay không. Các thẻ khác (<strong>, <em>...) bị bỏ qua.
function htmlToUnderlineChars(html) {
  const chars = [];
  let underlineDepth = 0;
  for (const token of String(html ?? '').split(/(<[^>]+>)/)) {
    if (!token) continue;
    if (token.startsWith('<')) {
      if (/^<u(\s[^>]*)?>$/i.test(token)) underlineDepth += 1;
      else if (/^<\/u>$/i.test(token) && underlineDepth > 0) underlineDepth -= 1;
      continue;
    }
    for (const ch of decodeBasicEntities(token)) chars.push({ ch, u: underlineDepth > 0 });
  }
  return chars;
}

// Đo tỉ lệ gạch chân trên các ký tự "có nghĩa" (chữ + số). Khoảng trắng và dấu câu
// bị bỏ qua nên gạch thừa/thiếu khoảng trắng cuối dòng không làm lệch kết quả.
function measureUnderlineRatio(chars) {
  let total = 0;
  let underlined = 0;
  for (const c of chars) {
    if (!/[\p{L}\p{N}]/u.test(c.ch)) continue;
    total += 1;
    if (c.u) underlined += 1;
  }
  return { total, underlined, ratio: total === 0 ? 0 : underlined / total };
}

// Từ ngưỡng này trở lên, phương án được coi là "đáp án đúng" theo cách gạch chân.
// Dưới 100% (gạch thiếu 1-2 chữ) vẫn tính đúng nhưng bị đưa vào needsReview.
// Dưới ngưỡng (vd chỉ gạch 1 cụm từ để nhấn mạnh) thì KHÔNG tính là đáp án đúng,
// nhưng vẫn bị gắn cờ needsReview vì có phần gạch chân.
const WORD_UNDERLINE_CORRECT_RATIO = 0.5;

// Mammoth mặc định KHÔNG bọc thẻ <u> quanh phần gạch chân (underline không có
// style map sẵn), nên phải khai báo styleMap "u => u" để runs có underline
// được bọc trong <u>...</u> — đây là cú pháp style-map chính thức của mammoth,
// không phải tự chế; "u" ở vế trái là document-matcher có sẵn cho underline.
const WORD_STYLE_MAP = ['u => u'];

// Chuyển file .docx thành danh sách đoạn văn { html, text, hasUnderline, chars }
async function readWordParagraphs(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new ApiError(400, 'Không đọc được file upload', 'IMPORT_FILE_MISSING');
  }
  let result;
  try {
    result = await mammoth.convertToHtml({ path: filePath }, { styleMap: WORD_STYLE_MAP });
  } catch (err) {
    throw new ApiError(
      400,
      'File không đúng định dạng Word (.docx) hoặc đã bị hỏng. Vui lòng kiểm tra lại file và tải lên lại.',
      'IMPORT_INVALID_FORMAT',
    );
  }
  const html = result.value ?? '';
  const matches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
  if (matches.length === 0) {
    throw new ApiError(400, 'File Word trống hoặc không có đoạn văn nào', 'IMPORT_EMPTY');
  }
  return matches.map((m) => ({
    html: m[1],
    text: stripHtmlToText(m[1]),
    hasUnderline: /<u>/.test(m[1]),
    chars: htmlToUnderlineChars(m[1]),
  }));
}

const WORD_HEADER_RE =
  /^C[aâ]u\s*\d+\s*:\s*\(\s*ch[uủ]\s*đ[eề]\s*:\s*(.*?)\s*-\s*b[ôộ]\s*ph[aậ]n\s*:\s*(.*?)\s*-\s*đ[ôộ]\s*kh[óo]\s*:\s*(.*?)\s*\)\s*(.*)$/iu;
const WORD_OPTION_RE = /^(\*)?\s*([A-Za-z])\s*[.)]\s*(.+)$/u;

// Phân tích toàn bộ file Word thành danh sách "dòng" tương đương dòng Excel,
// để tái sử dụng nguyên vẹn buildQuestionFromImportRow(). Trả về
// { rows, meta } — meta[i] song song với rows[i], chứa { questionNumber,
// ambiguous, suggestedCorrect, options } phục vụ hiển thị needsReview.
async function readImportRowsFromWord(filePath) {
  const paragraphs = await readWordParagraphs(filePath);

  const blocks = []; // { questionNumber, headerLine, optionParagraphs: [] }
  for (const p of paragraphs) {
    const headerMatch = p.text.match(WORD_HEADER_RE);
    if (headerMatch) {
      const numMatch = p.text.match(/^C[aâ]u\s*(\d+)/iu);
      blocks.push({
        questionNumber: numMatch ? Number(numMatch[1]) : blocks.length + 1,
        topicName: headerMatch[1].trim(),
        deptName: headerMatch[2].trim(),
        difficultyRaw: headerMatch[3].trim(),
        content: headerMatch[4].trim(),
        optionParagraphs: [],
      });
      continue;
    }
    if (blocks.length === 0) continue; // bỏ qua đoạn văn trước câu hỏi đầu tiên (nếu có)
    if (p.text.trim() === '') continue;
    blocks[blocks.length - 1].optionParagraphs.push(p);
  }

  if (blocks.length === 0) {
    throw new ApiError(
      400,
      'Không tìm thấy câu hỏi nào đúng khuôn "Câu N: (chủ đề: ... - bộ phận: ... - độ khó: ...) Nội dung". Kiểm tra lại định dạng file.',
      'IMPORT_EMPTY',
    );
  }

  // Xác định cách đánh dấu "chính" của toàn file (xuất hiện nhiều hơn)
  let starTotal = 0;
  let underlineTotal = 0;
  const parsedBlocks = blocks.map((b) => {
    const options = [];
    for (const p of b.optionParagraphs) {
      const m = p.text.match(WORD_OPTION_RE);
      if (!m) continue;
      const starMarked = Boolean(m[1]);
      // Đo gạch chân trên phần NỘI DUNG đáp án (bỏ tiền tố "*A." ở đầu dòng)
      const fullText = p.chars.map((c) => c.ch).join('');
      const prefix = fullText.match(/^\s*\*?\s*[A-Za-z]\s*[.)]\s*/u);
      const contentChars = p.chars.slice(prefix ? prefix[0].length : 0);
      const { total, underlined, ratio } = measureUnderlineRatio(contentChars);
      const underlineMarked = total > 0 && ratio >= WORD_UNDERLINE_CORRECT_RATIO;
      const underlinePartial = underlined > 0 && underlined < total; // có gạch nhưng không phủ hết
      if (starMarked) starTotal += 1;
      if (underlineMarked) underlineTotal += 1;
      options.push({
        index: options.length + 1,
        letter: m[2].toUpperCase(),
        content: m[3].trim(),
        starMarked,
        underlineMarked,
        underlinePartial,
      });
    }
    return { ...b, options };
  });

  const dominant = underlineTotal >= starTotal ? 'underline' : 'star';

  const rows = [];
  const meta = [];
  for (const b of parsedBlocks) {
    const starSet = b.options.filter((o) => o.starMarked).map((o) => o.index);
    const underlineSet = b.options.filter((o) => o.underlineMarked).map((o) => o.index);
    const dominantSet = dominant === 'underline' ? underlineSet : starSet;
    const minoritySet = dominant === 'underline' ? starSet : underlineSet;

    let suggestedCorrect;
    let ambiguous;
    if (dominantSet.length > 0 && minoritySet.length === 0) {
      suggestedCorrect = dominantSet;
      ambiguous = false;
    } else if (dominantSet.length === 0 && minoritySet.length > 0) {
      // Câu lẻ dùng cách đánh dấu thiểu số trong 1 file đa số dùng cách kia -> cần xác nhận lại
      suggestedCorrect = minoritySet;
      ambiguous = true;
    } else if (dominantSet.length > 0 && minoritySet.length > 0) {
      // Cả 2 cách cùng đánh dấu nhưng không trùng khớp hoàn toàn -> vẫn ưu tiên cách chính, nhưng cảnh báo
      const sameSet =
        dominantSet.length === minoritySet.length && dominantSet.every((v) => minoritySet.includes(v));
      suggestedCorrect = dominantSet;
      ambiguous = !sameSet;
    } else {
      suggestedCorrect = [];
      ambiguous = false; // sẽ bị buildQuestionFromImportRow báo lỗi "thiếu đáp án đúng" ở dưới
    }

    // Có đáp án chỉ gạch chân một phần (quên gạch vài chữ, hoặc chỉ gạch 1 cụm từ) -> cần xác nhận lại
    const partialIdx = b.options.filter((o) => o.underlinePartial).map((o) => o.index);
    const reviewReasons = [];
    if (ambiguous) reviewReasons.push('minority');
    if (partialIdx.length > 0) reviewReasons.push('partialUnderline');

    const row = {
      chude: b.topicName,
      noidung: b.content,
      // Ô "bộ phận" của Word là MÃ bộ phận (xem buildQuestionFromImportRow)
      mabophan: b.deptName || undefined,
      phamvi: b.deptName ? 'rieng' : 'chung',
      dokho: b.difficultyRaw || 'medium',
      correct: suggestedCorrect.join(','),
      answertype: suggestedCorrect.length > 1 ? 'multiple' : 'single',
    };
    b.options.forEach((o, idx) => {
      row[`option${idx + 1}`] = o.content;
    });

    rows.push(row);
    meta.push({
      questionNumber: b.questionNumber,
      ambiguous: reviewReasons.length > 0,
      reviewReasons,
      suggestedCorrect,
      options: b.options.map((o) => ({
        index: o.index,
        letter: o.letter,
        content: o.content,
        partialUnderline: o.underlinePartial,
      })),
    });
  }

  return { rows, meta };
}

// Câu không nhận diện được phương án nào (vd dùng danh sách tự đánh số của Word, hoặc
// phương án không bắt đầu bằng "A." / "A)") -> báo lỗi dễ hiểu thay vì "cần ít nhất 2 phương án".
function assertWordOptionsParsed(m) {
  if (m.options.length === 0) {
    throw new ApiError(
      400,
      `Câu ${m.questionNumber}: không nhận diện được phương án nào. Hãy gõ chữ cái A. B. C. trực tiếp ở đầu mỗi dòng (không dùng danh sách tự đánh số của Word), mỗi phương án 1 dòng riêng.`,
      'IMPORT_NO_OPTIONS',
    );
  }
}

// buildQuestionFromImportRow báo lỗi dạng "Dòng N: ..." (ngôn ngữ dành cho Excel).
// Với Word, đổi nhãn thành "Câu N" cho đúng ngữ cảnh người dùng đang thấy trong file.
function relabelRowError(err) {
  if (err instanceof ApiError && typeof err.message === 'string') {
    const relabeled = new ApiError(err.statusCode, err.message.replace(/^Dòng/, 'Câu'), err.code);
    relabeled.departmentName = err.departmentName;
    relabeled.departmentCode = err.departmentCode;
    relabeled.departmentDescription = err.departmentDescription;
    return relabeled;
  }
  return err;
}

// Bước 1: Xem trước (Preview) Import Word — cùng cấu trúc trả về như Excel,
// thêm field needsReview cho các câu dùng cách đánh dấu thiểu số cần xác nhận lại.
export async function previewImportQuestionsFromWordFile(filePath, usage) {
  let usageValue;
  try {
    usageValue = parseUsage(usage, { required: true });
  } catch (err) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore cleanup */
    }
    throw err;
  }

  const { rows, meta } = await readImportRowsFromWord(filePath);
  const seenKeys = await loadSeenKeys(usageValue);

  const ready = [];
  const duplicates = [];
  const errors = [];
  const missingDepts = new Map();
  const needsReview = [];

  for (let i = 0; i < rows.length; i += 1) {
    const m = meta[i];
    try {
      assertWordOptionsParsed(m);
      const payload = await buildQuestionFromImportRow(rows[i], m.questionNumber);
      const dedupeKey = buildDedupeKey(payload);
      if (seenKeys.has(dedupeKey)) {
        duplicates.push({ row: m.questionNumber, content: payload.content.slice(0, 120) });
      } else {
        seenKeys.add(dedupeKey);
        ready.push({ row: m.questionNumber, content: payload.content.slice(0, 120) });
      }
      if (m.ambiguous) {
        needsReview.push({
          row: m.questionNumber,
          content: payload.content.slice(0, 160),
          suggestedCorrect: m.suggestedCorrect,
          reasons: m.reviewReasons, // ['minority'] (khác cách đa số) và/hoặc ['partialUnderline'] (gạch chân một phần)
          options: m.options,
        });
      }
    } catch (err) {
      const relabeled = relabelRowError(err);
      if (relabeled.code === 'IMPORT_DEPARTMENT_NOT_FOUND') {
        const key = normalizeDeptName(relabeled.departmentName);
        const entry = missingDepts.get(key) ?? {
          name: relabeled.departmentName,
          code: '',
          description: '',
          rowCount: 0,
        };
        entry.rowCount += 1;
        if (!entry.code && relabeled.departmentCode) entry.code = relabeled.departmentCode;
        if (!entry.description && relabeled.departmentDescription) entry.description = relabeled.departmentDescription;
        missingDepts.set(key, entry);
      }
      errors.push({
        row: m.questionNumber,
        message: relabeled.message ?? 'Lỗi không xác định',
        code: relabeled.code ?? 'IMPORT_ROW_ERROR',
      });
    }
  }

  return {
    token: path.basename(filePath),
    usage: usageValue,
    totalRows: rows.length,
    readyCount: ready.length,
    duplicateCount: duplicates.length,
    errorCount: errors.length,
    missingDepartments: [...missingDepts.values()],
    duplicates,
    ready,
    errors,
    needsReview,
  };
}

// Bước 2: Xác nhận (Confirm) Import Word vào CSDL.
// correctOverrides: { [questionNumber]: number[] } — đáp án đúng do người ra đề
// chọn lại ở bước preview cho các câu nằm trong needsReview; câu không có override
// thì giữ nguyên suggestedCorrect đã tính khi preview (đúng ý: "bỏ qua thì cũng được").
export async function confirmImportQuestionsFromWord(token, options, createdBy, actorUserId, ipAddress) {
  const { createDepartments = [], keepDuplicateRows = [], usage, correctOverrides = {} } = options ?? {};
  const usageValue = parseUsage(usage, { required: true });
  const filePath = resolveImportTokenPath(token);
  if (!fs.existsSync(filePath)) {
    throw new ApiError(
      400,
      'Phiên import đã hết hạn hoặc đã được xử lý, vui lòng tải file lên lại',
      'IMPORT_TOKEN_EXPIRED',
    );
  }

  for (const dept of createDepartments) {
    const name = dept?.name?.trim();
    if (!name) continue;
    const code = dept?.code?.trim();
    if (!code) {
      throw new ApiError(
        400,
        `Vui lòng nhập mã bộ phận cho "${name}" trước khi import, hoặc bỏ tick "Tạo bộ phận mới" để bỏ qua các câu hỏi riêng của bộ phận này.`,
        'IMPORT_DEPARTMENT_CODE_REQUIRED',
      );
    }
    await upsertDepartmentForImport({ name, code, description: dept?.description });
  }

  const { rows, meta } = await readImportRowsFromWord(filePath);
  const seenKeys = await loadSeenKeys(usageValue);
  const keepSet = new Set(keepDuplicateRows);

  const created = [];
  const errors = [];
  const skippedDuplicates = [];

  for (let i = 0; i < rows.length; i += 1) {
    const m = meta[i];
    const override = correctOverrides?.[m.questionNumber] ?? correctOverrides?.[String(m.questionNumber)];
    if (Array.isArray(override) && override.length > 0) {
      rows[i].correct = override.join(',');
      rows[i].answertype = override.length > 1 ? 'multiple' : 'single';
    }
    try {
      assertWordOptionsParsed(m);
      const payload = await buildQuestionFromImportRow(rows[i], m.questionNumber);
      const dedupeKey = buildDedupeKey(payload);

      if (seenKeys.has(dedupeKey) && !keepSet.has(m.questionNumber)) {
        skippedDuplicates.push({ row: m.questionNumber, content: payload.content.slice(0, 80) });
        continue;
      }

      const question = await Question.create({
        content: payload.content,
        questionKind: payload.questionKind,
        answerType: payload.answerType,
        difficulty: payload.difficulty,
        scope: payload.scope,
        usage: usageValue,
        topicId: payload.topicId,
        departmentId: payload.departmentId,
        createdBy,
      });
      await replaceAnswers(question._id, payload.answers);
      created.push(question._id.toString());
      seenKeys.add(dedupeKey);
    } catch (err) {
      const relabeled = relabelRowError(err);
      errors.push({
        row: m.questionNumber,
        message: relabeled.message ?? 'Lỗi không xác định',
        code: relabeled.code ?? 'IMPORT_ROW_ERROR',
      });
    }
  }

  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore cleanup */
  }

  return {
    usage: usageValue,
    imported: created.length,
    failed: errors.length,
    skipped: skippedDuplicates.length,
    errors,
    skippedDuplicates,
    questionIds: created,
  };
}

// Thống kê cơ cấu câu hỏi khả dụng (Chung và Theo phòng ban) của một chủ đề phục vụ tạo kỳ thi
export async function getQuestionStatsByTopic(topicId) {
  if (!mongoose.isValidObjectId(topicId)) {
    throw new ApiError(400, 'topicId không hợp lệ', 'QUESTION_STATS_INVALID_TOPIC');
  }

  const [commonCount, deptCountsRaw, departments, employees] = await Promise.all([
    Question.countDocuments({
      topicId,
      scope: QUESTION_SCOPE.COMMON,
      isActive: true,
      ...questionUsageFilter(QUESTION_USAGE.EXAM),
    }),
    Question.aggregate([
      {
        $match: {
          topicId: new mongoose.Types.ObjectId(topicId),
          scope: QUESTION_SCOPE.DEPARTMENT_SPECIFIC,
          isActive: true,
          ...questionUsageFilter(QUESTION_USAGE.EXAM),
        },
      },
      { $group: { _id: '$departmentId', count: { $sum: 1 } } },
    ]),
    Department.find({ isActive: true }).sort({ name: 1 }).lean(),
    Employee.find({ isActive: true }).select('departmentId extraDepartmentIds').lean(),
  ]);

  const countByDeptId = new Map(deptCountsRaw.map((d) => [d._id.toString(), d.count]));

  // Đếm số lượng nhân viên đang hoạt động thuộc mỗi phòng ban (kể cả phòng chính hoặc kiêm nhiệm)
  const employeeCountByDeptId = new Map();
  for (const emp of employees) {
    const deptIds = new Set([
      emp.departmentId ? emp.departmentId.toString() : null,
      ...(emp.extraDepartmentIds || []).map((id) => (id ? id.toString() : null)),
    ].filter(Boolean));
    for (const dId of deptIds) {
      employeeCountByDeptId.set(dId, (employeeCountByDeptId.get(dId) || 0) + 1);
    }
  }

  return {
    topicId,
    commonCount,
    departments: departments.map((dept) => {
      const dIdStr = dept._id.toString();
      return {
        departmentId: dIdStr,
        name: dept.name,
        code: dept.code,
        count: countByDeptId.get(dIdStr) ?? 0,
        employeeCount: employeeCountByDeptId.get(dIdStr) ?? 0,
      };
    }),
  };
}