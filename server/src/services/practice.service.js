/**
 * Service Luyện tập theo chủ đề (Practice).
 * Câu hỏi CHỈ lấy từ ngân hàng ÔN TẬP (usage = 'practice', tách riêng khỏi ngân hàng thi chính thức),
 * gồm câu chung (Common) và câu riêng của đúng phòng ban thí sinh.
 * Kết quả luyện tập lưu riêng ở PracticeSession, không ảnh hưởng thống kê thi chính thức.
 */

import mongoose from 'mongoose';
import { Answer, Employee, Exam, Question, Topic } from '../models/index.js';
import { PracticeSession } from '../models/practice-session.model.js';
import { EXAM_STATUS, QUESTION_SCOPE, QUESTION_USAGE } from '../models/constants.js';
import { questionUsageFilter } from '../models/question.model.js';
import { getEmployeeDepartmentIds } from '../models/employee.model.js';
import { ApiError } from '../utils/api-error.js';

const MAX_QUESTIONS = 30;
const DIFFICULTY_VALUES = new Set(['all', 'easy', 'medium', 'hard']);
const MODE_VALUES = new Set(['instant', 'exam']);
// Thời gian chờ thêm (giây) cho độ trễ mạng khi tính hết giờ ở server
const TIME_GRACE_SEC = 15;

// Bộ lọc câu hỏi hợp lệ cho thí sinh: đúng chủ đề, đang hoạt động,
// và (câu chung HOẶC câu riêng của phòng ban thí sinh — phòng chính + các phòng kiêm nhiệm)
async function buildEligibleFilter(userId, topicIds, difficulty = 'all') {
  const employee = await Employee.findOne({ userId }).select('departmentId extraDepartmentIds').lean();
  const departmentIds = getEmployeeDepartmentIds(employee);
  if (departmentIds.length === 0) {
    throw new ApiError(400, 'Tài khoản chưa gắn phòng ban', 'PRACTICE_NO_DEPARTMENT');
  }

  const filter = {
    isActive: true,
    // Tuyệt đối không rút câu của ngân hàng thi chính thức: ôn tập trả đáp án đúng cho thí sinh
    ...questionUsageFilter(QUESTION_USAGE.PRACTICE),
    topicId: { $in: topicIds.map((id) => new mongoose.Types.ObjectId(id)) },
    $or: [
      { scope: QUESTION_SCOPE.COMMON },
      {
        scope: QUESTION_SCOPE.DEPARTMENT_SPECIFIC,
        departmentId: { $in: departmentIds.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    ],
  };

  if (difficulty && difficulty !== 'all') {
    filter.difficulty = difficulty;
  }
  return filter;
}

// Chuẩn hoá tham số đầu vào do client gửi lên
function normalizeStartOptions(options = {}) {
  const topicIds = Array.isArray(options.topicIds) ? options.topicIds.filter(Boolean) : [];
  if (topicIds.length === 0) {
    throw new ApiError(400, 'Vui lòng chọn ít nhất một chủ đề', 'PRACTICE_TOPIC_REQUIRED');
  }

  const questionCount = Math.min(
    Math.max(parseInt(options.questionCount, 10) || 10, 1),
    MAX_QUESTIONS,
  );
  const timeLimitMin = Math.max(parseInt(options.timeLimitMin, 10) || 0, 0);
  const difficulty = DIFFICULTY_VALUES.has(options.difficulty) ? options.difficulty : 'all';

  const mode = MODE_VALUES.has(options.mode) ? options.mode : 'exam';

  return { topicIds, questionCount, timeLimitMin, difficulty, mode };
}

// So khớp đúng VÀ ĐỦ tập đáp án đúng (dùng chung cho check từng câu và nộp bài)
// Bỏ trống hoặc câu không có đáp án đúng thì luôn tính là sai (không để 0 == 0 thành đúng)
function isSameAnswerSet(correctSet, selectedIds) {
  const selected = new Set(selectedIds.map(String));
  return (
    correctSet.size > 0 &&
    selected.size > 0 &&
    selected.size === correctSet.size &&
    [...selected].every((id) => correctSet.has(id))
  );
}

// Xáo trộn (Fisher-Yates) để thứ tự đáp án khác nhau giữa các lượt luyện
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Lấy tập đáp án đúng của 1 câu trong lượt luyện: ưu tiên ảnh chụp lúc bắt đầu;
// lượt luyện cũ (tạo trước khi có ảnh chụp) thì tra lại ngân hàng như trước.
async function getCorrectIdsForItem(item) {
  if (item.correctAnswerIds?.length > 0) return item.correctAnswerIds.map(String);
  const rows = await Answer.find({ questionId: item.questionId, isCorrect: true })
    .select('_id')
    .lean();
  return rows.map((a) => a._id.toString());
}

// Đã quá giờ (kể cả thời gian chờ) chưa? 0 = không giới hạn thời gian
function isTimeUp(session) {
  if (!session.timeLimitSec) return false;
  return Date.now() > session.startedAt.getTime() + (session.timeLimitSec + TIME_GRACE_SEC) * 1000;
}

// Dạng câu hỏi gửi xuống client (KHÔNG kèm đáp án đúng)
function toClientQuestion(q, orderedAnswers) {
  return {
    id: q._id,
    content: q.content,
    answerType: q.answerType,
    imageUrl: q.imageUrl || null,
    answers: orderedAnswers.map((a) => ({ id: a._id, content: a.content })),
  };
}

// Danh sách chủ đề có ít nhất 1 câu phù hợp với thí sinh
/** Đánh dấu chủ đề của kỳ thi đang phát hành (isExamTopic) và đưa lên đầu danh sách; còn lại giữ nguyên thứ tự. */
export function markExamTopic(topics, examTopicId) {
  const key = examTopicId ? String(examTopicId) : null;
  return topics
    .map((t) => ({ ...t, isExamTopic: key !== null && String(t.id) === key }))
    .sort((a, b) => Number(b.isExamTopic) - Number(a.isExamTopic));
}

export async function getAvailableTopics(userId) {
  const [topics, activeExam] = await Promise.all([
    Topic.find({ isActive: true }).select('name').lean(),
    Exam.findOne({ status: EXAM_STATUS.PUBLISHED }).select('topicId').lean(),
  ]);
  if (topics.length === 0) return [];

  // 1 truy vấn gộp theo chủ đề thay vì đếm lần lượt từng chủ đề
  const filter = await buildEligibleFilter(
    userId,
    topics.map((t) => t._id.toString()),
  );
  const counts = await Question.aggregate([
    { $match: filter },
    { $group: { _id: '$topicId', count: { $sum: 1 } } },
  ]);
  const countByTopic = new Map(counts.map((c) => [String(c._id), c.count]));

  return markExamTopic(
    topics
      .filter((t) => (countByTopic.get(t._id.toString()) ?? 0) > 0)
      .map((t) => ({ id: t._id, name: t.name, availableCount: countByTopic.get(t._id.toString()) })),
    activeExam?.topicId,
  );
}

// Bắt đầu bài luyện: rút ngẫu nhiên câu hỏi, trả về câu hỏi KHÔNG kèm isCorrect
export async function startPractice(userId, rawOptions) {
  const { topicIds, questionCount, timeLimitMin, difficulty, mode } = normalizeStartOptions(rawOptions);
  const filter = await buildEligibleFilter(userId, topicIds, difficulty);

  const availableCount = await Question.countDocuments(filter);
  if (availableCount === 0) {
    throw new ApiError(400, 'Chưa có câu hỏi phù hợp cho lựa chọn này', 'PRACTICE_NO_QUESTIONS');
  }

  const size = Math.min(questionCount, availableCount);
  const sampled = await Question.aggregate([{ $match: filter }, { $sample: { size } }]);

  const answers = await Answer.find({ questionId: { $in: sampled.map((q) => q._id) } })
    .sort({ sortOrder: 1 })
    .lean();
  const answersByQuestion = new Map();
  for (const a of answers) {
    const key = a.questionId.toString();
    if (!answersByQuestion.has(key)) answersByQuestion.set(key, []);
    answersByQuestion.get(key).push(a);
  }

  // Bỏ câu lỗi dữ liệu (không có đáp án đúng nào) vì thí sinh không thể trả lời đúng được
  const questions = sampled.filter((q) =>
    (answersByQuestion.get(q._id.toString()) ?? []).some((a) => a.isCorrect),
  );
  if (questions.length === 0) {
    throw new ApiError(400, 'Chưa có câu hỏi phù hợp cho lựa chọn này', 'PRACTICE_NO_QUESTIONS');
  }

  // Thứ tự đáp án đã xáo, lưu lại để tiếp tục bài dở vẫn giữ nguyên thứ tự
  const orderedByQuestion = new Map(
    questions.map((q) => [q._id.toString(), shuffle(answersByQuestion.get(q._id.toString()))]),
  );

  // Mỗi thí sinh chỉ có 1 bài đang làm: bài dở cũ coi như bỏ
  await PracticeSession.updateMany({ userId, status: 'in_progress' }, { $set: { status: 'expired' } });

  const session = await PracticeSession.create({
    userId,
    topicIds,
    difficulty,
    mode,
    questions: questions.map((q) => ({
      questionId: q._id,
      correctAnswerIds: answersByQuestion
        .get(q._id.toString())
        .filter((a) => a.isCorrect)
        .map((a) => a._id),
      optionIds: orderedByQuestion.get(q._id.toString()).map((a) => a._id),
    })),
    totalQuestions: questions.length,
    timeLimitSec: timeLimitMin * 60,
  });

  return {
    sessionId: session._id,
    mode: session.mode,
    availableCount,
    timeLimitSec: session.timeLimitSec,
    questions: questions.map((q) => toClientQuestion(q, orderedByQuestion.get(q._id.toString()))),
  };
}

// Chế độ instant: chấm 1 câu ngay khi thí sinh chọn/bấm Kiểm tra.
// Trả đáp án đúng CHỈ sau khi đã ghi nhận lựa chọn và khóa câu này.
export async function checkPracticeAnswer(userId, sessionId, questionId, selectedAnswerIds = []) {
  if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(questionId)) {
    throw new ApiError(400, 'Dữ liệu không hợp lệ', 'PRACTICE_INVALID_INPUT');
  }

  const session = await PracticeSession.findOne({ _id: sessionId, userId });
  if (!session) {
    throw new ApiError(404, 'Không tìm thấy lượt luyện', 'PRACTICE_NOT_FOUND');
  }
  if (session.status !== 'in_progress') {
    throw new ApiError(400, 'Lượt luyện đã kết thúc', 'PRACTICE_ALREADY_SUBMITTED');
  }
  if (session.mode !== 'instant') {
    throw new ApiError(400, 'Lượt luyện này không hỗ trợ kiểm tra từng câu', 'PRACTICE_MODE_NOT_INSTANT');
  }
  if (isTimeUp(session)) {
    throw new ApiError(400, 'Đã hết thời gian làm bài', 'PRACTICE_TIME_UP');
  }

  const item = session.questions.find((q) => String(q.questionId) === String(questionId));
  if (!item) {
    throw new ApiError(404, 'Câu hỏi không thuộc lượt luyện này', 'PRACTICE_QUESTION_NOT_IN_SESSION');
  }

  const correctIds = await getCorrectIdsForItem(item);
  const toResult = (doc) => {
    const saved = doc.questions.find((q) => String(q.questionId) === String(questionId));
    return {
      questionId: saved.questionId,
      isCorrect: saved.isCorrect,
      selectedAnswerIds: saved.selectedAnswerIds,
      correctAnswerIds: correctIds,
    };
  };

  // Đã kiểm tra rồi: trả lại kết quả cũ, không cho đổi đáp án
  if (item.checked) return toResult(session);

  const ids = (Array.isArray(selectedAnswerIds) ? selectedAnswerIds : [])
    .map(String)
    .filter((id) => mongoose.isValidObjectId(id));
  if (ids.length === 0) {
    throw new ApiError(400, 'Vui lòng chọn ít nhất một đáp án', 'PRACTICE_NO_SELECTION');
  }
  const isCorrect = isSameAnswerSet(new Set(correctIds), ids);

  // Khóa nguyên tử: chỉ ghi nếu câu này CHƯA được kiểm tra. Nếu 2 request đến cùng lúc,
  // request đến sau không ghi đè mà nhận lại kết quả của request đến trước.
  const qid = new mongoose.Types.ObjectId(questionId);
  const updated = await PracticeSession.findOneAndUpdate(
    {
      _id: session._id,
      userId,
      status: 'in_progress',
      questions: { $elemMatch: { questionId: qid, checked: { $ne: true } } },
    },
    {
      $set: {
        'questions.$[q].selectedAnswerIds': ids,
        'questions.$[q].isCorrect': isCorrect,
        'questions.$[q].checked': true,
      },
    },
    { arrayFilters: [{ 'q.questionId': qid, 'q.checked': { $ne: true } }], new: true },
  );

  const fresh = updated ?? (await PracticeSession.findOne({ _id: session._id, userId }));
  if (!fresh) {
    throw new ApiError(404, 'Không tìm thấy lượt luyện', 'PRACTICE_NOT_FOUND');
  }
  return toResult(fresh);
}

function buildSubmitResult(session) {
  return {
    sessionId: session._id,
    totalQuestions: session.totalQuestions,
    correctCount: session.correctCount,
    percent: session.totalQuestions > 0
      ? Math.round((session.correctCount / session.totalQuestions) * 100)
      : 0,
  };
}

// Nộp bài: gán đáp án client gửi lên, so khớp đúng và đủ tập đáp án đúng, tính điểm
export async function submitPractice(userId, sessionId, answers = []) {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new ApiError(400, 'Dữ liệu không hợp lệ', 'PRACTICE_INVALID_INPUT');
  }
  const session = await PracticeSession.findOne({ _id: sessionId, userId });
  if (!session) {
    throw new ApiError(404, 'Không tìm thấy lượt luyện', 'PRACTICE_NOT_FOUND');
  }
  // Đã nộp rồi (vd: tự nộp khi hết giờ rồi người dùng bấm nộp thêm, hoặc client gửi lại do rớt mạng):
  // trả lại kết quả cũ thay vì báo lỗi, để nộp bài luôn an toàn khi gọi lặp (idempotent).
  if (session.status === 'submitted') return buildSubmitResult(session);
  if (session.status !== 'in_progress') {
    // Lượt đã bị bỏ, hoặc bị thay bằng lượt luyện mới: không có kết quả để trả
    throw new ApiError(
      400,
      'Lượt luyện này đã bị hủy hoặc đã được thay bằng lượt mới',
      'PRACTICE_SESSION_EXPIRED',
    );
  }

  const answerByQuestion = new Map(
    (Array.isArray(answers) ? answers : []).map((a) => [
      String(a.questionId),
      Array.isArray(a.selectedAnswerIds) ? a.selectedAnswerIds.map(String) : [],
    ]),
  );
  for (const item of session.questions) {
    // Câu đã kiểm tra (chế độ instant) đã bị khóa đáp án: bỏ qua dữ liệu client gửi lại,
    // tránh sửa đáp án sau khi đã biết đáp án đúng.
    if (item.checked) continue;
    const ids = answerByQuestion.get(String(item.questionId)) ?? [];
    item.selectedAnswerIds = ids.filter((id) => mongoose.isValidObjectId(id));
  }

  // Tập đáp án đúng: dùng ảnh chụp lúc bắt đầu; chỉ tra ngân hàng cho lượt luyện cũ chưa có ảnh chụp
  const correctSetByQuestion = new Map();
  const legacyIds = [];
  for (const item of session.questions) {
    if (item.correctAnswerIds?.length > 0) {
      correctSetByQuestion.set(
        item.questionId.toString(),
        new Set(item.correctAnswerIds.map(String)),
      );
    } else {
      legacyIds.push(item.questionId);
    }
  }
  if (legacyIds.length > 0) {
    const rows = await Answer.find({ questionId: { $in: legacyIds }, isCorrect: true }).lean();
    for (const a of rows) {
      const key = a.questionId.toString();
      if (!correctSetByQuestion.has(key)) correctSetByQuestion.set(key, new Set());
      correctSetByQuestion.get(key).add(a._id.toString());
    }
  }

  let correctCount = 0;
  for (const item of session.questions) {
    const correct = correctSetByQuestion.get(item.questionId.toString()) ?? new Set();
    item.isCorrect = isSameAnswerSet(correct, item.selectedAnswerIds);
    if (item.isCorrect) correctCount += 1;
  }

  session.correctCount = correctCount;
  session.status = 'submitted';
  session.submittedAt = new Date();
  await session.save();

  return buildSubmitResult(session);
}

// Bài đang làm dở của thí sinh (để tiếp tục sau khi tải lại trang / đổi tab / thoát app).
// Trả null nếu không có. Nếu bài đã quá giờ: trả { timedOut: true, questionIds, answers } và
// KHÔNG kèm nội dung câu hỏi, để client tự nộp với các lựa chọn đã có (thí sinh không làm thêm được).
export async function getActivePractice(userId) {
  const session = await PracticeSession.findOne({ userId, status: 'in_progress' }).sort({
    startedAt: -1,
  });
  if (!session) return null;

  if (isTimeUp(session)) {
    const lockedAnswers = {};
    for (const item of session.questions) {
      if (item.checked) lockedAnswers[item.questionId.toString()] = item.selectedAnswerIds.map(String);
    }
    return {
      sessionId: session._id,
      timedOut: true,
      questionIds: session.questions.map((i) => i.questionId.toString()),
      answers: lockedAnswers,
    };
  }

  const questionIds = session.questions.map((i) => i.questionId);
  const [questions, answers] = await Promise.all([
    Question.find({ _id: { $in: questionIds } }).lean(),
    Answer.find({ questionId: { $in: questionIds } }).sort({ sortOrder: 1 }).lean(),
  ]);
  const questionById = new Map(questions.map((q) => [q._id.toString(), q]));
  const answersByQuestion = new Map();
  for (const a of answers) {
    const key = a.questionId.toString();
    if (!answersByQuestion.has(key)) answersByQuestion.set(key, []);
    answersByQuestion.get(key).push(a);
  }

  const clientQuestions = [];
  const selected = {};
  const checked = {};
  for (const item of session.questions) {
    const key = item.questionId.toString();
    const q = questionById.get(key);
    if (!q) continue; // câu đã bị xóa cứng: không hiển thị lại

    const pool = answersByQuestion.get(key) ?? [];
    let ordered = pool;
    if (item.optionIds?.length > 0) {
      const byId = new Map(pool.map((a) => [a._id.toString(), a]));
      ordered = item.optionIds.map((id) => byId.get(id.toString())).filter(Boolean);
    }
    clientQuestions.push(toClientQuestion(q, ordered));

    // Câu đã kiểm tra (chế độ instant): đáp án đúng đã được hiện cho thí sinh rồi nên trả lại được
    if (item.checked) {
      selected[key] = item.selectedAnswerIds.map(String);
      checked[key] = {
        isCorrect: item.isCorrect,
        correctAnswerIds: await getCorrectIdsForItem(item),
      };
    }
  }

  if (clientQuestions.length === 0) {
    session.status = 'expired';
    await session.save();
    return null;
  }

  const remainingSec = session.timeLimitSec
    ? Math.max(
        0,
        Math.floor(session.timeLimitSec - (Date.now() - session.startedAt.getTime()) / 1000),
      )
    : null;

  return {
    sessionId: session._id,
    mode: session.mode,
    timeLimitSec: session.timeLimitSec,
    remainingSec,
    questions: clientQuestions,
    answers: selected,
    checked,
  };
}

// Bỏ bài đang làm dở: đánh dấu hết hạn, không tính vào thống kê tiến độ
export async function abandonPractice(userId, sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new ApiError(400, 'Dữ liệu không hợp lệ', 'PRACTICE_INVALID_INPUT');
  }
  const result = await PracticeSession.updateOne(
    { _id: sessionId, userId, status: 'in_progress' },
    { $set: { status: 'expired' } },
  );
  if (result.matchedCount === 0) {
    throw new ApiError(404, 'Không tìm thấy lượt luyện đang làm', 'PRACTICE_NOT_FOUND');
  }
  return { sessionId };
}

// Tổng hợp tiến độ: tổng quan, theo chủ đề (yếu nhất trước), lịch sử gần nhất
export async function getPracticeProgress(userId) {
  const sessions = await PracticeSession.find({ userId, status: 'submitted' })
    .sort({ submittedAt: -1 })
    .populate('topicIds', 'name')
    .lean();

  const totalQuestions = sessions.reduce((sum, s) => sum + s.totalQuestions, 0);
  const totalCorrect = sessions.reduce((sum, s) => sum + s.correctCount, 0);

  const byTopic = new Map();
  for (const s of sessions) {
    for (const t of s.topicIds) {
      if (!t) continue;
      const key = t._id.toString();
      if (!byTopic.has(key)) {
        byTopic.set(key, { topicId: key, name: t.name, questions: 0, correct: 0, sessions: 0 });
      }
      const entry = byTopic.get(key);
      entry.questions += s.totalQuestions;
      entry.correct += s.correctCount;
      entry.sessions += 1;
    }
  }

  const topics = [...byTopic.values()]
    .map((e) => ({
      ...e,
      percent: e.questions > 0 ? Math.round((e.correct / e.questions) * 100) : 0,
    }))
    .sort((a, b) => a.percent - b.percent);

  return {
    totalSessions: sessions.length,
    totalQuestions,
    averagePercent: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
    topics,
    recent: sessions.slice(0, 10).map((s) => ({
      id: s._id,
      topics: s.topicIds.filter(Boolean).map((t) => t.name),
      totalQuestions: s.totalQuestions,
      correctCount: s.correctCount,
      percent: s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0,
      submittedAt: s.submittedAt,
    })),
  };
}

// Tính số ngày luyện tập liên tiếp (streak) tính đến hôm nay, và các huy hiệu đã đạt.
// Không lưu bảng riêng - tính trực tiếp từ PracticeSession mỗi lần gọi, dữ liệu ít nên không nặng.
function computeStreakDays(submittedDates) {
  // submittedDates: mảng Date đã sort giảm dần (mới nhất trước)
  if (submittedDates.length === 0) return 0;

  const toDayKey = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };

  const uniqueDays = [...new Set(submittedDates.map(toDayKey))].sort((a, b) => b - a);

  const today = toDayKey(new Date());
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Chuỗi tính từ hôm nay hoặc hôm qua (nếu hôm nay chưa luyện thì vẫn còn "giữ" chuỗi tới hết hôm nay)
  if (uniqueDays[0] !== today && uniqueDays[0] !== today - oneDayMs) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDays.length; i += 1) {
    if (uniqueDays[i - 1] - uniqueDays[i] === oneDayMs) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

// Danh sách mốc huy hiệu - đơn giản, dễ hiểu, không quá nhiều mốc gây rối mắt.
// Ngưỡng có thể chỉnh lại ở đây khi cần, không ảnh hưởng chỗ khác.
const BADGE_DEFS = [
  { id: 'questions_50', label: 'Chăm chỉ khởi đầu', desc: 'Hoàn thành 50 câu luyện tập', check: (st) => st.totalQuestions >= 50 },
  { id: 'questions_200', label: 'Bền bỉ', desc: 'Hoàn thành 200 câu luyện tập', check: (st) => st.totalQuestions >= 200 },
  { id: 'questions_500', label: 'Kiên trì vượt trội', desc: 'Hoàn thành 500 câu luyện tập', check: (st) => st.totalQuestions >= 500 },
  { id: 'sessions_10', label: 'Luyện tập đều đặn', desc: 'Hoàn thành 10 bài luyện tập', check: (st) => st.totalSessions >= 10 },
  { id: 'sessions_30', label: 'Ôn tập chuyên cần', desc: 'Hoàn thành 30 bài luyện tập', check: (st) => st.totalSessions >= 30 },
  { id: 'streak_3', label: 'Duy trì 3 ngày', desc: 'Luyện tập 3 ngày liên tiếp', check: (st) => st.streakDays >= 3 },
  { id: 'streak_7', label: 'Duy trì 1 tuần', desc: 'Luyện tập 7 ngày liên tiếp', check: (st) => st.streakDays >= 7 },
  {
    id: 'topic_master',
    label: 'Nắm vững chủ đề',
    desc: 'Một chủ đề đạt từ 90% đúng trở lên (tối thiểu 20 câu)',
    check: (st) => st.topics.some((t) => t.questions >= 20 && t.percent >= 90),
  },
];

// Câu động viên ngắn, chọn theo tình huống - giữ giọng trân trọng, phù hợp người 25-55 tuổi, không sến.
function buildEncouragement({ streakDays, totalSessions, weakest }) {
  if (totalSessions === 0) {
    return 'Bắt đầu buổi luyện tập đầu tiên của bạn nhé.';
  }
  if (streakDays >= 7) {
    return `Bạn đã duy trì ${streakDays} ngày liên tiếp, rất đáng ghi nhận!`;
  }
  if (streakDays >= 3) {
    return `Bạn đang luyện tập đều đặn ${streakDays} ngày liên tiếp, cố gắng giữ nhịp này nhé.`;
  }
  if (weakest && weakest.percent < 70) {
    return `Bạn đã tiến bộ nhiều rồi, thử ôn thêm chủ đề "${weakest.name}" nhé.`;
  }
  return 'Cảm ơn bạn đã dành thời gian ôn luyện, cố gắng phát huy nhé.';
}

export async function getPracticeAchievements(userId) {
  const progress = await getPracticeProgress(userId);

  const submittedDates = await PracticeSession.find({ userId, status: 'submitted' })
    .select('submittedAt')
    .lean();
  const streakDays = computeStreakDays(submittedDates.map((s) => s.submittedAt).filter(Boolean));

  const stats = {
    totalQuestions: progress.totalQuestions,
    totalSessions: progress.totalSessions,
    streakDays,
    topics: progress.topics,
  };

  const badges = BADGE_DEFS.filter((b) => b.check(stats)).map((b) => ({
    id: b.id,
    label: b.label,
    desc: b.desc,
  }));

  const weakest = progress.topics[0];
  const message = buildEncouragement({ streakDays, totalSessions: progress.totalSessions, weakest });

  return { streakDays, badges, message };
}