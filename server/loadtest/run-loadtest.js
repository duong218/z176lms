/**
 * Tạo tải mô phỏng N thí sinh ảo, mỗi người làm đúng luồng của client thật:
 * đăng nhập -> bắt đầu thi -> (heartbeat 15s, /auth/me 15s, chuông 30s, lưu đáp án ~45s) -> nộp bài.
 * Dùng fetch có sẵn của Node 22, không cài thêm thư viện.
 *
 * Chạy: node loadtest/run-loadtest.js --users 200 --ramp 20 --duration 90 [--base http://127.0.0.1:5000]
 *   --ramp 0      : tất cả đăng nhập CÙNG LÚC (kịch bản xấu nhất)
 *   --ramp 20     : đăng nhập rải ngẫu nhiên trong 20 giây
 *   --duration 90 : thời gian làm bài (giây) trước khi nộp; nên < 15 phút (access token sống 15 phút)
 * Cần: đã chạy seed-loadtest.js và server đang chạy. Chỉ dùng tài khoản giả lt0001...
 */
const argv = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => (cur.startsWith('--') ? [...acc, [cur.slice(2), arr[i + 1]]] : acc), []),
);
const USERS = Number(argv.users ?? 200);
const RAMP_SEC = Number(argv.ramp ?? 0);
const DURATION_SEC = Number(argv.duration ?? 90);
const BASE = argv.base ?? 'http://127.0.0.1:5000';
const PASSWORD = 'LoadTest#12345';
const TIMEOUT_MS = 30_000;
const DO_SUBMIT = (argv.submit ?? '1') !== '0'; // --submit 0: bỏ bước nộp bài (vd khi chạy trên FerretDB không hỗ trợ findAndModify projection)

const HEARTBEAT_MS = 15_000;
const ME_MS = 15_000;
const UNREAD_MS = 30_000;
const ANSWER_MS = 45_000;

const stats = new Map(); // tên endpoint -> { lat: [], ok, fail, codes: {} }
const flags = { autoSubmitted: 0, loginFailed: 0, startFailed: 0, submitted: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rec(name, ms, status) {
  if (!stats.has(name)) stats.set(name, { lat: [], ok: 0, fail: 0, codes: {} });
  const s = stats.get(name);
  s.lat.push(ms);
  s.codes[status] = (s.codes[status] ?? 0) + 1;
  if (status >= 200 && status < 300) s.ok += 1;
  else s.fail += 1;
}

async function call(name, method, path, token, body) {
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* bỏ qua body rỗng */ }
    rec(name, performance.now() - t0, res.status);
    return { status: res.status, json };
  } catch (err) {
    rec(name, performance.now() - t0, err.name === 'AbortError' ? 'timeout' : 'neterr');
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

async function virtualUser(i) {
  if (RAMP_SEC > 0) await sleep(Math.random() * RAMP_SEC * 1000); // chỉ là script test, Math.random ở đây không liên quan bảo mật
  const username = `lt${String(i).padStart(4, '0')}`;

  const login = await call('login', 'POST', '/api/auth/login', null, { username, password: PASSWORD });
  const token = login.json?.data?.accessToken;
  if (!token) { flags.loginFailed += 1; return; }

  await call('my-exam', 'GET', '/api/exam-attempts/my-exam', token);
  const start = await call('start', 'POST', '/api/exam-attempts/start', token, {});
  const attemptId = start.json?.data?.attemptId;
  if (!attemptId) { flags.startFailed += 1; return; }
  // Giống client: sau khi bắt đầu, tải lại my-exam để lấy danh sách câu hỏi của lượt đang làm
  const reload = await call('my-exam(sau start)', 'GET', '/api/exam-attempts/my-exam', token);
  const questions = reload.json?.data?.questions ?? [];

  let stopped = false;
  const timers = [];
  const every = (ms, fn) => timers.push(setInterval(() => { if (!stopped) fn(); }, ms + Math.random() * 1000));

  every(ME_MS, () => call('auth/me', 'GET', '/api/auth/me', token));
  every(UNREAD_MS, () => call('unread-count', 'GET', '/api/notifications/unread-count', token));
  every(HEARTBEAT_MS, async () => {
    const r = await call('heartbeat', 'POST', `/api/exam-attempts/${attemptId}/heartbeat`, token);
    if (r.json?.data?.autoSubmitReason) { flags.autoSubmitted += 1; stopped = true; }
  });
  let qi = 0;
  every(ANSWER_MS, () => {
    const q = questions[qi % Math.max(questions.length, 1)];
    qi += 1;
    if (q?.options?.[0]) call('answer', 'PATCH', `/api/exam-attempts/${attemptId}/answer`, token, { questionId: q.id, selectedAnswerIds: [q.options[0].id] });
  });

  await sleep(DURATION_SEC * 1000);
  if (!stopped && DO_SUBMIT) {
    stopped = true;
    const r = await call('submit', 'POST', `/api/exam-attempts/${attemptId}/submit`, token, { answers: [] });
    if (r.status === 200) flags.submitted += 1;
  }
  stopped = true;
  timers.forEach(clearInterval);
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0; };

async function main() {
  console.info(`[loadtest] ${USERS} thí sinh ảo | ramp=${RAMP_SEC}s | làm bài=${DURATION_SEC}s | ${BASE}`);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: USERS }, (_, k) => virtualUser(k + 1)));
  console.info(`\n[loadtest] xong sau ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.info('endpoint        n     ok   lỗi    p50ms   p95ms   p99ms   maxms  mã trạng thái');
  for (const [name, s] of [...stats.entries()].sort()) {
    console.info(
      `${name.padEnd(14)} ${String(s.lat.length).padStart(5)} ${String(s.ok).padStart(6)} ${String(s.fail).padStart(5)} ` +
      `${pct(s.lat, 50).toFixed(0).padStart(8)} ${pct(s.lat, 95).toFixed(0).padStart(7)} ${pct(s.lat, 99).toFixed(0).padStart(7)} ` +
      `${Math.max(...s.lat).toFixed(0).padStart(7)}  ${JSON.stringify(s.codes)}`,
    );
  }
  console.info(`\n[loadtest] đăng nhập lỗi: ${flags.loginFailed} | bắt đầu thi lỗi: ${flags.startFailed} | TỰ NỘP OAN (autoSubmit): ${flags.autoSubmitted} | nộp bài OK: ${flags.submitted}`);
}
main();