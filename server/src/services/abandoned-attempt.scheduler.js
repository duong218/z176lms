/**
 * Tiến trình lập lịch Nộp bài các lượt thi bị bỏ rơi (Abandoned Attempt Scheduler).
 * Chạy mỗi phút: nộp và chấm các lượt thi in_progress mà thí sinh đã tắt tab/máy và không quay lại,
 * để bài làm dở vẫn có điểm trong báo cáo thay vì treo mãi ở trạng thái "đang làm".
 */

import cron from 'node-cron';
import { finalizeAbandonedAttempts } from './exam-attempt.service.js';
import { examService } from './exam.service.js';

const CRON_EXPRESSION = '* * * * *'; // mỗi phút
const TIMEZONE = 'Asia/Ho_Chi_Minh';

let running = false; // chống chồng lượt khi một lần quét kéo dài quá 1 phút

// Hàm thực thi tác vụ nộp bài các lượt thi bị bỏ rơi & tự động lưu trữ kỳ thi hết hạn
async function runAbandonedAttemptSweep() {
  if (running) return;
  running = true;
  try {
    const { finalized, failed } = await finalizeAbandonedAttempts();
    if (finalized > 0 || failed > 0) {
      console.log(`[abandoned-attempt] Đã tự nộp ${finalized} lượt thi bị bỏ rơi` + (failed > 0 ? `, lỗi ${failed} lượt` : ''));
    }

    // Tự động lưu trữ các kỳ thi đã quá hạn (endDate) khi không còn thí sinh nào làm bài dở
    const archivedExams = await examService.archiveExpiredExams();
    if (archivedExams.length > 0) {
      console.log(
        `[scheduler] Đã tự động lưu trữ ${archivedExams.length} kỳ thi hết hạn: ${archivedExams.map((e) => e.title).join(', ')}`,
      );
    }
  } catch (err) {
    console.error('[abandoned-attempt] Quét lượt thi và lưu trữ kỳ thi thất bại:', err.message);
  } finally {
    running = false;
  }
}

// Khởi tạo và đăng ký Cron Job khi server khởi động
export function initAbandonedAttemptScheduler() {
  cron.schedule(CRON_EXPRESSION, runAbandonedAttemptSweep, { timezone: TIMEZONE });
  console.log(`[abandoned-attempt] Đã đăng ký cron nộp bài lượt thi bị bỏ rơi: "${CRON_EXPRESSION}" (${TIMEZONE})`);
}

export { runAbandonedAttemptSweep };