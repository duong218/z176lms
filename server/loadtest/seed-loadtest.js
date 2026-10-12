/**
 * Seed DỮ LIỆU GIẢ cho kiểm thử tải: N thí sinh ảo + 1 kỳ thi "Đã đăng" + mã đề + câu hỏi giả.
 * Chạy: node loadtest/seed-loadtest.js [soThiSinh=500]
 * AN TOÀN: chỉ chạy khi tên DB trong MONGODB_URI có chữ "loadtest" (tránh xóa nhầm DB thật/DB test).
 * Chỉ dùng dữ liệu giả (lt0001..., LT0001...), mật khẩu chung cho mọi tài khoản ảo.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import {
  Role, User, Department, Employee, Topic, Question, Answer,
  Exam, ExamCode, ExamCodeQuestion, ExamCandidate,
  ExamAttempt, AttemptQuestion, CandidateAnswer, Result,
} from '../src/models/index.js';
import { ROLE_CHOSEN_BY } from '../src/models/exam-candidate.model.js';

export const LT_PASSWORD = 'LoadTest#12345'; // mật khẩu giả dùng chung
const TOTAL_USERS = Number(process.argv[2] ?? 500);
const QUESTION_POOL = 40;
const QUESTIONS_PER_EXAM = 30;
const pad = (n) => String(n).padStart(4, '0');

async function insertInChunks(Model, docs, size = 500) {
  const out = [];
  for (let i = 0; i < docs.length; i += size) {
    out.push(...(await Model.insertMany(docs.slice(i, i + size))));
  }
  return out;
}

async function main() {
  await connectDatabase();
  const dbName = mongoose.connection.name;
  if (!/loadtest/i.test(dbName)) {
    throw new Error(`Từ chối chạy: tên DB "${dbName}" không chứa "loadtest". Đổi MONGODB_URI sang DB riêng.`);
  }
  const role = await Role.findOne({ code: 'candidate' });
  if (!role) throw new Error('Chưa có vai trò candidate — hãy chạy server 1 lần (SEED_ON_START=true) để seed vai trò.');

  // Dọn dữ liệu kiểm thử cũ (chỉ trong DB loadtest)
  await Promise.all([
    ExamAttempt.deleteMany({}), AttemptQuestion.deleteMany({}), CandidateAnswer.deleteMany({}), Result.deleteMany({}),
    ExamCandidate.deleteMany({}), ExamCodeQuestion.deleteMany({}), ExamCode.deleteMany({}), Exam.deleteMany({}),
    Answer.deleteMany({}), Question.deleteMany({}), Topic.deleteMany({ name: 'LOADTEST-CHUDE' }),
  ]);
  const oldUsers = await User.find({ username: /^lt\d+$/ }).select('_id');
  await Employee.deleteMany({ userId: { $in: oldUsers.map((u) => u._id) } });
  await User.deleteMany({ username: /^lt\d+$/ });
  await Department.deleteMany({ name: 'LOADTEST-PHONGBAN' });

  const dept = await Department.create({ name: 'LOADTEST-PHONGBAN', code: 'LT-PB' });
  const topic = await Topic.create({ name: 'LOADTEST-CHUDE' });

  // Câu hỏi giả (chung), mỗi câu 4 đáp án, đáp án đầu là đúng
  const questions = await insertInChunks(
    Question,
    Array.from({ length: QUESTION_POOL }, (_, i) => ({
      content: `Câu hỏi giả số ${i + 1}: chọn đáp án đúng.`,
      questionKind: 'theory', answerType: 'single', difficulty: 'easy',
      scope: 'Common', topicId: topic._id, usage: 'exam', isActive: true,
    })),
  );
  const answerDocs = questions.flatMap((q) =>
    ['A', 'B', 'C', 'D'].map((label, k) => ({
      questionId: q._id, content: `Đáp án ${label}`, isCorrect: k === 0, sortOrder: k,
    })),
  );
  await insertInChunks(Answer, answerDocs);

  const now = Date.now();
  const exam = await Exam.create({
    title: 'LOADTEST - Kỳ thi giả', topicId: topic._id,
    startDate: new Date(now - 3600_000), endDate: new Date(now + 86_400_000),
    durationMinutes: 30, totalQuestions: QUESTIONS_PER_EXAM,
    commonQuestionCount: QUESTIONS_PER_EXAM, departmentQuestionCount: 0,
    allowCommonCompensation: true, departmentScope: 'all',
    status: 'published', passThresholdPercent: 70, publishedAt: new Date(),
  });
  const code = await ExamCode.create({ examId: exam._id, code: 'LT-001', departmentId: dept._id });
  await ExamCodeQuestion.insertMany(
    questions.slice(0, QUESTIONS_PER_EXAM).map((q, i) => ({ examCodeId: code._id, questionId: q._id, orderIndex: i })),
  );

  // Hash 1 lần dùng chung (cùng cost với hệ thống) -> seed 3000 tài khoản chỉ mất vài giây
  const passwordHash = await bcrypt.hash(LT_PASSWORD, env.bcryptSaltRounds);
  const users = await insertInChunks(
    User,
    Array.from({ length: TOTAL_USERS }, (_, i) => ({
      username: `lt${pad(i + 1)}`, passwordHash, roleId: role._id, mustChangePassword: false, isActive: true,
    })),
  );
  const employees = await insertInChunks(
    Employee,
    users.map((u, i) => ({
      fullname: `Thi Sinh Ao ${pad(i + 1)}`, departmentId: dept._id, userId: u._id, employeeCode: `LT${pad(i + 1)}`,
    })),
  );
  await insertInChunks(
    ExamCandidate,
    employees.map((e) => ({
      examId: exam._id, employeeId: e._id, examCodeId: code._id,
      roleConfirmedAt: new Date(), roleChosenBy: ROLE_CHOSEN_BY.SYSTEM,
    })),
  );

  console.info(`[loadtest-seed] DB=${dbName} | ${TOTAL_USERS} thí sinh ảo (lt0001..lt${pad(TOTAL_USERS)}), mật khẩu chung: ${LT_PASSWORD}`);
  await disconnectDatabase();
}

main().catch((err) => {
  console.error('[loadtest-seed] lỗi:', err.message);
  process.exit(1);
});