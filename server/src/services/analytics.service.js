/**
 * Service Phân tích: (1) chất lượng câu hỏi thi chính thức, (2) bản đồ năng lực theo chủ đề.
 * Chỉ ĐỌC dữ liệu sẵn có (CandidateAnswer, Result, ExamAttempt, PracticeSession...), không đổi schema.
 * Các hàm tính toán (computeQuestionStats, tallyByTopic, buildTopicCompetency, pickWeakest) là hàm thuần
 * để test được không cần DB — xem server/test-analytics.mjs.
 */

import mongoose from 'mongoose';
import {
  Answer,
  CandidateAnswer,
  Department,
  Employee,
  ExamAttempt,
  ExamCandidate,
  Question,
  Result,
  Topic,
  ATTEMPT_STATUS,
  ATTEMPT_TYPE,
  EXAM_STATUS,
} from '../models/index.js';
import { Exam } from '../models/exam.model.js';
import { PracticeSession } from '../models/practice-session.model.js';
import { QUESTION_USAGE } from '../models/constants.js';
import { questionUsageFilter } from '../models/question.model.js';
import { ApiError } from '../utils/api-error.js';

// ── Ngưỡng (đổi ở đây, không rải trong code) ──
const MIN_RESPONSES = 5; // dưới ngưỡng: "chưa đủ dữ liệu", không hiện chỉ số
const RELIABLE_RESPONSES = 30; // từ ngưỡng này mới gắn cờ (độ phân biệt cần mẫu đủ lớn)
const MIN_TOPIC_ANSWERS = 5; // chủ đề có ít hơn số câu này: chưa đủ dữ liệu
const MIN_DEPT_CANDIDATES = 3; // phòng ban ít hơn số người này: ẩn toàn bộ số liệu (bảo vệ cá nhân)
const MIN_PRACTICE_ANSWERS = 5; // sẵn sàng thi: số câu ôn tập (đúng chủ đề kỳ thi) thí sinh phải thực sự làm; nộp bài trống không tính
const WEAK_BELOW = 0.7; // tỷ lệ đúng dưới mức này = chủ đề yếu (khớp điểm đạt mặc định 70%)
const TOO_EASY = 0.95;
const TOO_HARD = 0.1;
const LOW_DISCRIMINATION = 0.2;
const SUSPECT_DISCRIMINATION = -0.2; // nhóm điểm cao đúng ít hơn nhóm thấp rõ rệt -> nghi sai đáp án
const UNKNOWN_TOPIC = 'Chưa phân loại';

// ── Ngưỡng phát hiện bất thường (chỉ là gợi ý để xem xét, không kết luận gian lận) ──
const MIN_ATTEMPTS_FOR_PAIRS = 10; // kỳ thi ít hơn số lượt này: không so cặp (mẫu quá nhỏ, dễ báo nhầm)
const MIN_SHARED_WRONG = 5; // số câu cùng chọn đúng một đáp án sai tối thiểu để nêu cặp
const SHARED_WRONG_RATIO = 0.6; // ...và chiếm từ tỷ lệ này trong số câu sai của người sai ít hơn
const POPULAR_DISTRACTOR = 0.3; // đáp án sai có > 30% người chọn là "bẫy phổ biến": trùng nhau không có ý nghĩa
const FAST_SEC_PER_QUESTION = 8; // trung bình dưới số giây này cho mỗi câu đã trả lời = quá nhanh
const MIN_ANSWERED_FOR_SPEED = 10; // dưới số câu này không xét tốc độ
const MIN_LEAVES = 3; // rời màn hình thi từ số lần này trở lên mới nêu (1-2 lần dễ do thao tác vô ý)

const sid = (v) => String(v);

/**
 * Mức độ sẵn sàng thi: mỗi phòng ban có bao nhiêu thí sinh (trong `employees`) nằm trong `practicedUserIds`.
 * Hàm thuần (không đụng DB). Phòng ban dưới `minCandidates` người: ẩn số liệu như department-competency.
 */
export function buildPracticeReadiness(employees, practicedUserIds, deptNames, minCandidates) {
  const done = new Set(practicedUserIds.map(sid));
  const byDept = new Map();
  for (const e of employees) {
    const key = sid(e.departmentId);
    const d = byDept.get(key) ?? { candidates: 0, practiced: 0 };
    d.candidates += 1;
    if (done.has(sid(e.userId))) d.practiced += 1;
    byDept.set(key, d);
  }
  return [...byDept]
    .map(([departmentId, { candidates, practiced }]) => {
      const base = { departmentId, name: deptNames.get(departmentId) ?? departmentId, candidates };
      return candidates < minCandidates
        ? { ...base, insufficientData: true, practiced: null, rate: null }
        : { ...base, insufficientData: false, practiced, rate: ratio(practiced, candidates) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
const round2 = (n) => Math.round(n * 100) / 100;
const ratio = (num, den) => (den > 0 ? round2(num / den) : null);

// ───────────────────────── 1) Phân tích câu hỏi (hàm thuần) ─────────────────────────

/**
 * @param responses [{ attemptId, score, questionId, selectedAnswerIds: string[], isCorrect }]
 * @param questions Map questionId -> { content, topicId, difficulty, scope, answerType }
 * @param options   Map questionId -> [{ answerId, content, isCorrect }]
 */
export function computeQuestionStats(responses, questions, options) {
  const byQuestion = new Map();
  for (const r of responses) {
    if (!byQuestion.has(r.questionId)) byQuestion.set(r.questionId, []);
    byQuestion.get(r.questionId).push(r);
  }

  const items = [];
  for (const [questionId, rows] of byQuestion) {
    const meta = questions.get(questionId) ?? {};
    const n = rows.length;
    const base = {
      questionId,
      content: meta.content,
      topicId: meta.topicId ? sid(meta.topicId) : null,
      difficulty: meta.difficulty,
      scope: meta.scope,
      answerType: meta.answerType,
      responses: n,
    };

    if (n < MIN_RESPONSES) {
      items.push({
        ...base,
        insufficientData: true,
        reliability: 'low',
        correctRate: null,
        discrimination: null,
        flags: [],
        options: [],
      });
      continue;
    }

    // Nhóm cao/thấp = nửa trên/nửa dưới theo điểm tổng của CHÍNH những người làm câu này
    // (mỗi người một bộ câu riêng nên không có bảng xếp hạng chung). Đồng điểm: tách theo attemptId.
    // ponytail: điểm tổng có chứa chính câu này (chưa loại ra), đủ dùng khi bài ≥ 20 câu.
    const sorted = [...rows].sort((a, b) => b.score - a.score || (a.attemptId < b.attemptId ? -1 : 1));
    const half = Math.floor(n / 2);
    const upper = sorted.slice(0, half);
    const lower = sorted.slice(n - half);
    const rate = (group, pred) => group.filter(pred).length / group.length;

    const correctRate = round2(rows.filter((r) => r.isCorrect).length / n);
    const discrimination = round2(rate(upper, (r) => r.isCorrect) - rate(lower, (r) => r.isCorrect));
    const reliability = n >= RELIABLE_RESPONSES ? 'ok' : 'low';

    const picked = (group, answerId) => rate(group, (r) => r.selectedAnswerIds.includes(answerId));
    const optionStats = (options.get(questionId) ?? []).map((o) => ({
      answerId: o.answerId,
      content: o.content,
      isCorrect: o.isCorrect,
      selectedRate: round2(picked(rows, o.answerId)),
      upperRate: round2(picked(upper, o.answerId)),
      lowerRate: round2(picked(lower, o.answerId)),
    }));

    const flags = [];
    if (reliability === 'ok') {
      const tooEasy = correctRate >= TOO_EASY;
      const tooHard = correctRate <= TOO_HARD;
      if (tooEasy) flags.push('too_easy');
      if (tooHard) flags.push('too_hard');
      if (discrimination <= SUSPECT_DISCRIMINATION) flags.push('suspect_key');
      else if (!tooEasy && !tooHard && discrimination < LOW_DISCRIMINATION) flags.push('low_discrimination');
      if (
        (meta.difficulty === 'hard' && correctRate >= 0.85) ||
        (meta.difficulty === 'easy' && correctRate <= 0.4)
      ) {
        flags.push('difficulty_mismatch');
      }
    }

    items.push({ ...base, insufficientData: false, reliability, correctRate, discrimination, flags, options: optionStats });
  }
  return items;
}

// ───────────────────────── 2) Năng lực theo chủ đề (hàm thuần) ─────────────────────────

/** rows: [{ topicId, source: 'official'|'practice', correct: boolean }] -> Map topicId -> {official, practice} */
export function tallyByTopic(rows) {
  const tally = new Map();
  for (const r of rows) {
    if (!tally.has(r.topicId)) {
      tally.set(r.topicId, { official: { total: 0, correct: 0 }, practice: { total: 0, correct: 0 } });
    }
    const bucket = tally.get(r.topicId)[r.source];
    bucket.total += 1;
    if (r.correct) bucket.correct += 1;
  }
  return tally;
}

export function buildTopicCompetency(tally, topicNames) {
  const out = [];
  for (const [topicId, t] of tally) {
    const total = t.official.total + t.practice.total;
    const correct = t.official.correct + t.practice.correct;
    const insufficientData = total < MIN_TOPIC_ANSWERS;
    out.push({
      topicId,
      name: topicNames.get(topicId) ?? UNKNOWN_TOPIC,
      total,
      rate: insufficientData ? null : ratio(correct, total),
      insufficientData,
      official: { total: t.official.total, rate: ratio(t.official.correct, t.official.total) },
      practice: { total: t.practice.total, rate: ratio(t.practice.correct, t.practice.total) },
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function pickWeakest(topics, limit = 3) {
  return topics
    .filter((t) => !t.insufficientData && t.rate < WEAK_BELOW)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, limit);
}

// ───────────────────────── 3) Phát hiện bất thường (hàm thuần) ─────────────────────────

/**
 * Chỉ nêu dấu hiệu để Người duyệt đề xem xét, không kết luận gian lận.
 * So đáp án theo MÃ đáp án (không theo vị trí A/B/C) nên việc xáo riêng từng lượt thi không che được trùng lặp.
 * ponytail: so cặp theo từng nhóm cùng chọn đáp án sai; đủ cho vài trăm thí sinh, lớn hơn thì cần lập chỉ mục khác.
 * @param attempts  [{ attemptId, employeeId, startedAt, submittedAt, leaveCount? }] (đã loại bài bị hệ thống tự nộp)
 * @param responses [{ attemptId, questionId, selectedAnswerIds: string[], isCorrect }]
 */
export function detectAnomalies(attempts, responses) {
  const stat = new Map(); // attemptId -> { answered, wrong }
  const responders = new Map(); // questionId -> số người đã trả lời
  const groups = new Map(); // "câu|tập đáp án sai" -> { questionId, attemptIds }
  for (const r of responses) {
    if (!r.selectedAnswerIds.length) continue;
    responders.set(r.questionId, (responders.get(r.questionId) ?? 0) + 1);
    const s = stat.get(r.attemptId) ?? { answered: 0, wrong: 0 };
    s.answered += 1;
    stat.set(r.attemptId, s);
    if (r.isCorrect) continue;
    s.wrong += 1;
    const key = `${r.questionId}|${[...r.selectedAnswerIds].sort().join(',')}`;
    if (!groups.has(key)) groups.set(key, { questionId: r.questionId, attemptIds: [] });
    groups.get(key).attemptIds.push(r.attemptId);
  }

  const employeeOf = new Map(attempts.map((a) => [a.attemptId, a.employeeId]));
  const sharedWrong = [];
  if (attempts.length >= MIN_ATTEMPTS_FOR_PAIRS) {
    const pairs = new Map(); // "a|b" -> số câu cùng sai giống nhau
    for (const g of groups.values()) {
      const ids = g.attemptIds;
      if (ids.length < 2 || ids.length / responders.get(g.questionId) > POPULAR_DISTRACTOR) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (employeeOf.get(ids[i]) === employeeOf.get(ids[j])) continue; // cùng một người thi nhiều lượt
          const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
      }
    }
    for (const [key, shared] of pairs) {
      const [a, b] = key.split('|');
      const base = Math.min(stat.get(a).wrong, stat.get(b).wrong);
      if (shared >= MIN_SHARED_WRONG && shared / base >= SHARED_WRONG_RATIO) {
        sharedWrong.push({ attemptIds: [a, b], shared, ofWrong: base });
      }
    }
    sharedWrong.sort((x, y) => y.shared - x.shared || y.shared / y.ofWrong - x.shared / x.ofWrong);
  }

  const fast = [];
  for (const a of attempts) {
    const answered = stat.get(a.attemptId)?.answered ?? 0;
    if (answered < MIN_ANSWERED_FOR_SPEED || !a.startedAt || !a.submittedAt) continue;
    const totalSeconds = Math.round((new Date(a.submittedAt) - new Date(a.startedAt)) / 1000);
    const secondsPerQuestion = round2(totalSeconds / answered);
    if (secondsPerQuestion < FAST_SEC_PER_QUESTION) {
      fast.push({ attemptId: a.attemptId, totalSeconds, answered, secondsPerQuestion });
    }
  }
  fast.sort((x, y) => x.secondsPerQuestion - y.secondsPerQuestion);

  const leaves = attempts
    .filter((a) => (a.leaveCount ?? 0) >= MIN_LEAVES)
    .map((a) => ({ attemptId: a.attemptId, leaveCount: a.leaveCount }))
    .sort((x, y) => y.leaveCount - x.leaveCount);

  return { sharedWrong, fast, leaves };
}

// ───────────────────────── Truy vấn DB ─────────────────────────

const assertObjectId = (value, name) => {
  if (value && !mongoose.isValidObjectId(value)) {
    throw new ApiError(400, `${name} không hợp lệ`, 'INVALID_ID');
  }
};

/** Lượt thi CHÍNH THỨC đã nộp của các thí sinh khớp candidateFilter. */
async function loadAttempts(candidateFilter) {
  const cands = await ExamCandidate.find(candidateFilter).select('_id employeeId examId').lean();
  const candById = new Map(cands.map((c) => [sid(c._id), c]));
  if (candById.size === 0) return { attempts: [], candById };
  const attempts = await ExamAttempt.find({
    examCandidateId: { $in: [...candById.keys()] },
    attemptType: ATTEMPT_TYPE.OFFICIAL,
    status: ATTEMPT_STATUS.SUBMITTED,
  })
    .select('_id examCandidateId departmentId autoSubmitReason startedAt submittedAt leaveCount')
    .lean();
  return { attempts, candById };
}

const loadAnswers = (attemptIds) =>
  attemptIds.length === 0
    ? []
    : CandidateAnswer.find({ examAttemptId: { $in: attemptIds } })
        .select('examAttemptId questionId selectedAnswerIds isCorrect')
        .lean();

const topicNameMap = async () =>
  new Map((await Topic.find({}).select('_id name').lean()).map((t) => [sid(t._id), t.name]));

/**
 * Câu trả lời thi chính thức dùng cho năng lực. Bài bị hệ thống tự nộp: câu bỏ trống
 * không phản ánh năng lực (thí sinh chưa kịp làm) nên loại; câu đã trả lời vẫn tính.
 */
async function loadOfficialRows(candidateFilter) {
  const { attempts, candById } = await loadAttempts(candidateFilter);
  const byId = new Map(attempts.map((a) => [sid(a._id), a]));
  const answers = await loadAnswers([...byId.keys()]);
  const rows = [];
  for (const a of answers) {
    const attempt = byId.get(sid(a.examAttemptId));
    const blank = !a.selectedAnswerIds?.length;
    if (!attempt || (attempt.autoSubmitReason && blank)) continue;
    rows.push({
      attempt,
      employeeId: sid(candById.get(sid(attempt.examCandidateId)).employeeId),
      questionId: sid(a.questionId),
      correct: !!a.isCorrect,
    });
  }
  return { rows, attempts, candById };
}

const topicOfQuestions = async (questionIds) => {
  if (questionIds.length === 0) return new Map();
  const qs = await Question.find({ _id: { $in: questionIds } }).select('_id topicId').lean();
  return new Map(qs.map((q) => [sid(q._id), q.topicId ? sid(q.topicId) : null]));
};

export const analyticsService = {
  /** Người ra đề: chất lượng từng câu hỏi, chỉ từ kỳ thi chính thức. */
  async getQuestionAnalysis({ examId, topicId } = {}) {
    assertObjectId(examId, 'examId');
    assertObjectId(topicId, 'topicId');

    const { attempts } = await loadAttempts(examId ? { examId } : {});
    // Bài tự nộp (rời trang/hết giờ/thay kỳ thi) làm lệch điểm tổng -> không dùng để xếp nhóm cao/thấp.
    const usable = attempts.filter((a) => !a.autoSubmitReason);
    const ids = usable.map((a) => sid(a._id));

    const results = ids.length ? await Result.find({ examAttemptId: { $in: ids } }).select('examAttemptId score').lean() : [];
    const scoreByAttempt = new Map(results.map((r) => [sid(r.examAttemptId), r.score]));

    const responses = (await loadAnswers(ids))
      .filter((a) => scoreByAttempt.has(sid(a.examAttemptId)))
      .map((a) => ({
        attemptId: sid(a.examAttemptId),
        score: scoreByAttempt.get(sid(a.examAttemptId)),
        questionId: sid(a.questionId),
        selectedAnswerIds: (a.selectedAnswerIds ?? []).map(sid),
        isCorrect: !!a.isCorrect,
      }));

    const questionIds = [...new Set(responses.map((r) => r.questionId))];
    const questionDocs = questionIds.length
      ? await Question.find({ _id: { $in: questionIds } }).select('_id content topicId difficulty scope answerType').lean()
      : [];
    const questions = new Map(questionDocs.map((q) => [sid(q._id), q]));

    const answerDocs = questionIds.length
      ? await Answer.find({ questionId: { $in: questionIds } }).select('_id questionId content isCorrect sortOrder').sort({ sortOrder: 1 }).lean()
      : [];
    const options = new Map();
    for (const a of answerDocs) {
      const key = sid(a.questionId);
      if (!options.has(key)) options.set(key, []);
      options.get(key).push({ answerId: sid(a._id), content: a.content, isCorrect: !!a.isCorrect });
    }

    const names = await topicNameMap();
    const weight = (i) => (i.insufficientData ? 3 : i.flags.includes('suspect_key') ? 0 : i.flags.length ? 1 : 2);
    const items = computeQuestionStats(responses, questions, options)
      .filter((i) => !topicId || i.topicId === sid(topicId))
      .map((i) => ({ ...i, topicName: names.get(i.topicId) ?? UNKNOWN_TOPIC }))
      .sort((a, b) => weight(a) - weight(b) || b.responses - a.responses);

    return {
      meta: {
        attemptsAnalyzed: usable.length,
        minResponses: MIN_RESPONSES,
        reliableResponses: RELIABLE_RESPONSES,
      },
      items,
    };
  },

  /** Thí sinh: năng lực của CHÍNH MÌNH (thi chính thức + luyện tập). */
  async getMyCompetency(userId) {
    const employee = await Employee.findOne({ userId }).select('_id').lean();
    const official = employee ? (await loadOfficialRows({ employeeId: employee._id })).rows : [];

    const sessions = await PracticeSession.find({ userId, status: 'submitted' })
      .select('questions.questionId questions.checked questions.isCorrect questions.selectedAnswerIds')
      .lean();
    // Câu luyện tập bỏ trống (chưa kiểm tra, chưa chọn) không phản ánh năng lực.
    const practice = sessions
      .flatMap((s) => s.questions ?? [])
      .filter((q) => q.checked || q.selectedAnswerIds?.length > 0)
      .map((q) => ({ questionId: sid(q.questionId), correct: !!q.isCorrect }));

    const topicByQuestion = await topicOfQuestions([
      ...new Set([...official.map((r) => r.questionId), ...practice.map((r) => r.questionId)]),
    ]);
    const tagged = [
      ...official.map((r) => ({ ...r, source: 'official' })),
      ...practice.map((r) => ({ ...r, source: 'practice' })),
    ]
      .map((r) => ({ topicId: topicByQuestion.get(r.questionId), source: r.source, correct: r.correct }))
      .filter((r) => r.topicId);

    const topics = buildTopicCompetency(tallyByTopic(tagged), await topicNameMap());
    return { topics, weakest: pickWeakest(topics) };
  },

  /**
   * Người duyệt đề: năng lực gộp theo phòng ban (CHỈ thi chính thức, không có dữ liệu cá nhân).
   * Phòng ban tính theo vai trò đã thi (ExamAttempt.departmentId), lượt cũ thì theo phòng chính.
   */
  async getDepartmentCompetency({ examId } = {}) {
    assertObjectId(examId, 'examId');
    const { rows, attempts, candById } = await loadOfficialRows(examId ? { examId } : {});

    const employeeIds = [...new Set([...candById.values()].map((c) => sid(c.employeeId)))];
    const employees = employeeIds.length
      ? await Employee.find({ _id: { $in: employeeIds } }).select('_id departmentId').lean()
      : [];
    const mainDept = new Map(employees.map((e) => [sid(e._id), e.departmentId ? sid(e.departmentId) : null]));
    const deptOf = (attempt, employeeId) =>
      attempt.departmentId ? sid(attempt.departmentId) : mainDept.get(employeeId);

    const peopleByDept = new Map();
    for (const a of attempts) {
      const employeeId = sid(candById.get(sid(a.examCandidateId)).employeeId);
      const dept = deptOf(a, employeeId);
      if (!dept) continue;
      if (!peopleByDept.has(dept)) peopleByDept.set(dept, new Set());
      peopleByDept.get(dept).add(employeeId);
    }

    const topicByQuestion = await topicOfQuestions([...new Set(rows.map((r) => r.questionId))]);
    const rowsByDept = new Map();
    for (const r of rows) {
      const dept = deptOf(r.attempt, r.employeeId);
      const topicId = topicByQuestion.get(r.questionId);
      if (!dept || !topicId) continue;
      if (!rowsByDept.has(dept)) rowsByDept.set(dept, []);
      rowsByDept.get(dept).push({ topicId, source: 'official', correct: r.correct });
    }

    const deptNames = new Map((await Department.find({}).select('_id name').lean()).map((d) => [sid(d._id), d.name]));
    const topicNames = await topicNameMap();

    const departments = [...peopleByDept].map(([departmentId, people]) => {
      const base = { departmentId, name: deptNames.get(departmentId) ?? departmentId, candidates: people.size };
      if (people.size < MIN_DEPT_CANDIDATES) {
        return { ...base, insufficientData: true, overallRate: null, topics: [] };
      }
      const deptRows = rowsByDept.get(departmentId) ?? [];
      const topics = buildTopicCompetency(tallyByTopic(deptRows), topicNames).map((t) => ({
        topicId: t.topicId,
        name: t.name,
        total: t.total,
        rate: t.rate,
        insufficientData: t.insufficientData,
      }));
      const overallRate = deptRows.length < MIN_TOPIC_ANSWERS ? null : ratio(deptRows.filter((r) => r.correct).length, deptRows.length);
      return { ...base, insufficientData: false, overallRate, topics };
    });

    departments.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return { minCandidates: MIN_DEPT_CANDIDATES, departments };
  },

  /**
   * Người duyệt đề: mức độ sẵn sàng của kỳ thi ĐANG PHÁT HÀNH (chỉ có tối đa 1 kỳ thi published).
   * Mẫu số = thí sinh của kỳ thi đó; tử số = người đã nộp ít nhất 1 bài luyện tập CÓ chủ đề của kỳ thi.
   * Chỉ số gộp theo phòng ban, không lộ tên ai chưa luyện. Chưa có kỳ thi đang phát hành -> exam: null.
   */
  async getPracticeReadiness() {
    const exam = await Exam.findOne({ status: EXAM_STATUS.PUBLISHED }).select('title topicId startDate endDate').lean();
    if (!exam) return { minCandidates: MIN_DEPT_CANDIDATES, exam: null, departments: [] };

    // Ngân hàng ôn tập khác ngân hàng thi; điểm chung duy nhất là CHỦ ĐỀ. Nên "ôn đúng kỳ thi" = đã làm câu ôn tập của chủ đề đó.
    const topicQuestionIds = await Question.distinct('_id', {
      topicId: exam.topicId,
      isActive: true,
      ...questionUsageFilter(QUESTION_USAGE.PRACTICE),
    });
    const candidates = await ExamCandidate.find({ examId: exam._id }).select('employeeId').lean();
    const [employees, practicedRows, depts, topic] = await Promise.all([
      Employee.find({ _id: { $in: candidates.map((c) => c.employeeId) }, isActive: true })
        .select('departmentId userId')
        .lean(),
      // Đếm CÂU ĐÃ LÀM thuộc chủ đề thi (không đếm phiên): phiên chọn nhiều chủ đề có thể không rút trúng câu nào của chủ đề thi
      topicQuestionIds.length
        ? PracticeSession.aggregate([
            { $match: { status: 'submitted', 'questions.questionId': { $in: topicQuestionIds } } },
            { $unwind: '$questions' },
            {
              $match: {
                'questions.questionId': { $in: topicQuestionIds },
                $or: [{ 'questions.checked': true }, { 'questions.selectedAnswerIds.0': { $exists: true } }],
              },
            },
            { $group: { _id: '$userId', answered: { $sum: 1 } } },
            { $match: { answered: { $gte: MIN_PRACTICE_ANSWERS } } },
          ])
        : [],
      Department.find({}).select('_id name').lean(),
      Topic.findById(exam.topicId).select('name').lean(),
    ]);
    const deptNames = new Map(depts.map((d) => [sid(d._id), d.name]));
    return {
      minCandidates: MIN_DEPT_CANDIDATES,
      exam: {
        title: exam.title,
        topicName: topic?.name ?? '',
        startDate: exam.startDate,
        endDate: exam.endDate,
        practiceQuestionCount: topicQuestionIds.length,
        minAnswers: MIN_PRACTICE_ANSWERS,
      },
      departments: buildPracticeReadiness(employees, practicedRows.map((r) => r._id), deptNames, MIN_DEPT_CANDIDATES),
    };
  },

  /**
   * Người duyệt đề: dấu hiệu bất thường theo từng kỳ thi (CÓ định danh thí sinh để Leader xem xét).
   * Chỉ là gợi ý, không kết luận. Bài bị hệ thống tự nộp bị loại (thời gian bị cắt, không phản ánh tốc độ).
   */
  async getAnomalies({ examId } = {}) {
    assertObjectId(examId, 'examId');
    const { attempts, candById } = await loadAttempts(examId ? { examId } : {});
    const usable = attempts.filter((a) => !a.autoSubmitReason);
    const answers = await loadAnswers(usable.map((a) => sid(a._id)));

    const examOf = (a) => sid(candById.get(sid(a.examCandidateId)).examId);
    const empOf = (a) => sid(candById.get(sid(a.examCandidateId)).employeeId);

    const employeeIds = [...new Set(usable.map(empOf))];
    const employees = employeeIds.length
      ? await Employee.find({ _id: { $in: employeeIds } }).select('_id fullname employeeCode').lean()
      : [];
    const empById = new Map(employees.map((e) => [sid(e._id), e]));
    const who = (a) => {
      const e = empById.get(empOf(a));
      return { attemptId: sid(a._id), name: e?.fullname ?? null, code: e?.employeeCode ?? null };
    };

    const byExam = new Map();
    for (const a of usable) {
      const k = examOf(a);
      if (!byExam.has(k)) byExam.set(k, []);
      byExam.get(k).push(a);
    }
    // Kèm kỳ thi ĐANG DIỄN RA (published, tối đa 1) dù chưa có lượt nộp nào, để màn hình luôn mở đúng kỳ hiện tại.
    const keys = [...byExam.keys()];
    const examDocs = await Exam.find(
      examId ? { _id: { $in: keys } } : { $or: [{ _id: { $in: keys } }, { status: EXAM_STATUS.PUBLISHED }] },
    )
      .select('_id title status startDate endDate publishedAt createdAt')
      .lean();
    const docById = new Map(examDocs.map((e) => [sid(e._id), e]));
    const meta = (id) => {
      const d = docById.get(id);
      return {
        title: d?.title ?? id,
        running: d?.status === EXAM_STATUS.PUBLISHED,
        endsAt: d?.endDate ?? d?.publishedAt ?? d?.startDate ?? d?.createdAt ?? null,
      };
    };

    const exams = [];
    for (const [id, list] of byExam) {
      const ids = new Set(list.map((a) => sid(a._id)));
      const responses = answers
        .filter((r) => ids.has(sid(r.examAttemptId)))
        .map((r) => ({
          attemptId: sid(r.examAttemptId),
          questionId: sid(r.questionId),
          selectedAnswerIds: (r.selectedAnswerIds ?? []).map(sid),
          isCorrect: !!r.isCorrect,
        }));
      const found = detectAnomalies(
        list.map((a) => ({ attemptId: sid(a._id), employeeId: empOf(a), startedAt: a.startedAt, submittedAt: a.submittedAt, leaveCount: a.leaveCount ?? 0 })),
        responses
      );
      const byAttempt = new Map(list.map((a) => [sid(a._id), a]));
      exams.push({
        examId: id,
        ...meta(id),
        attempts: list.length,
        sharedWrong: found.sharedWrong.map((p) => ({
          people: p.attemptIds.map((x) => who(byAttempt.get(x))),
          shared: p.shared,
          ofWrong: p.ofWrong,
        })),
        fast: found.fast.map((f) => ({ ...who(byAttempt.get(f.attemptId)), ...f })),
        leaves: found.leaves.map((l) => ({ ...who(byAttempt.get(l.attemptId)), ...l })),
      });
    }
    // Kỳ thi đang diễn ra có thể chưa có lượt nộp nào nên chưa nằm trong byExam: vẫn đưa vào để mở mặc định.
    if (!examId) {
      for (const d of examDocs) {
        const id = sid(d._id);
        if (d.status === EXAM_STATUS.PUBLISHED && !byExam.has(id)) {
          exams.push({ examId: id, ...meta(id), attempts: 0, sharedWrong: [], fast: [], leaves: [] });
        }
      }
    }
    // Đang diễn ra lên đầu, sau đó kỳ thi kết thúc gần nhất; client mặc định mở kỳ đầu tiên.
    const time = (e) => (e.endsAt ? new Date(e.endsAt).getTime() : 0);
    exams.sort((a, b) => Number(b.running) - Number(a.running) || time(b) - time(a));

    return {
      thresholds: {
        minAttemptsForPairs: MIN_ATTEMPTS_FOR_PAIRS,
        minSharedWrong: MIN_SHARED_WRONG,
        sharedWrongRatio: SHARED_WRONG_RATIO,
        fastSecPerQuestion: FAST_SEC_PER_QUESTION,
        minAnsweredForSpeed: MIN_ANSWERED_FOR_SPEED,
        minLeaves: MIN_LEAVES,
      },
      exams,
    };
  },
};