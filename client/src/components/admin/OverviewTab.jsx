import { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  FileCheck,
  ClipboardList,
  GraduationCap,
  Cloud,
  Loader2,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  ServerCrash,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { fetchOverviewStats, triggerBackup } from '../../services/admin.service';

// Tab Tổng quan cho Quản trị viên — cùng khung với tab Tổng quan của Người ra đề: "việc cần xử lý trước, số liệu sau".
//  1. Việc cần xử lý: thiếu vai trò thiết yếu (không ai ra đề / duyệt đề / dự thi), chỉ có 1 quản trị viên.
//  2. Tài khoản: tổng + thanh phân bổ theo vai trò + từng vai trò bấm được để sang tab Tài khoản.
//  3. Kỳ thi đang diễn ra.
//  4. Sao lưu dữ liệu (kèm kết quả và lối tắt sang tab Sao lưu & Phục hồi).
// Chỉ dùng lại fetchOverviewStats / triggerBackup đã có, không thêm API mới. Bỏ recharts vì thẻ vai trò đã nói đủ.

const ROLE_META = {
  admin: { label: 'Quản trị viên', icon: Shield, color: 'gray' },
  leader: { label: 'Người duyệt đề', icon: FileCheck, color: 'blue' },
  examiner: { label: 'Người ra đề', icon: ClipboardList, color: 'amber' },
  candidate: { label: 'Người dự thi', icon: GraduationCap, color: 'green' },
};

// 5 màu chức năng, sắc đậm để chữ/icon trắng đủ tương phản.
const COLOR_CLASSES = {
  gray: 'bg-[#334155] text-white',
  blue: 'bg-[#006BA1] text-white',
  amber: 'bg-[#F6AD37] text-[#0F172A]',
  green: 'bg-[#166534] text-white',
};

const BAR_CLASSES = {
  gray: 'bg-[#334155]',
  blue: 'bg-[#006BA1]',
  amber: 'bg-[#F6AD37]',
  green: 'bg-[#166534]',
};

function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// Khung thẻ dùng chung: tiêu đề + mô tả ngắn + nội dung
const Panel = ({ title, hint, children, className = '' }) => (
  <section className={`bg-white rounded-xl border border-slate-200 shadow-z176 p-4 sm:p-5 ${className}`}>
    <div className="mb-3">
      <h3 className="text-base font-bold text-[#0F172A]">{title}</h3>
      {hint && <p className="text-sm text-[#334155] mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

// Một dòng việc cần xử lý; nếu có onClick thì cả dòng bấm được
const ActionRow = ({ icon: Icon, tone, title, detail, cta, onClick }) => {
  const toneClass = tone === 'danger' ? 'bg-[#FEECEC] text-[#C53030]' : 'bg-[#FFF7E6] text-[#B45309]';
  const content = (
    <>
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${toneClass}`}>
        <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-base font-semibold text-[#0F172A] break-words">{title}</span>
        {detail && <span className="block text-sm text-[#334155] mt-0.5 line-clamp-2 break-words">{detail}</span>}
      </span>
      {onClick && (
        <span className="hidden sm:flex items-center gap-1 text-sm font-semibold text-[#008BC5] shrink-0">
          {cta}
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </span>
      )}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-[#008BC5]/50 hover:bg-slate-50 transition-colors min-h-[56px]"
    >
      {content}
    </button>
  ) : (
    <div className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 min-h-[56px]">{content}</div>
  );
};

export const OverviewTab = ({ onNavigate }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true); // chỉ true ở lần tải đầu
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [backupLoading, setBackupLoading] = useState(false);
  const [backupResult, setBackupResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    setError(false);
    fetchOverviewStats()
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setUpdatedAt(new Date());
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const res = await triggerBackup();
      setBackupResult(res);
    } catch {
      setBackupResult({ success: false, message: 'Backup thất bại' });
    } finally {
      setBackupLoading(false);
    }
  };

  const reload = () => setReloadKey((k) => k + 1);

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-busy="true" aria-label="Đang tải dữ liệu tổng quan">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
          <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div role="alert" className="bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-xl p-4 sm:p-5 flex flex-wrap items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-[#E53E3E]/10 flex items-center justify-center shrink-0">
          <ServerCrash className="w-5 h-5 text-[#E53E3E]" aria-hidden="true" />
        </div>
        <p className="font-medium flex-1 min-w-[200px]">Không tải được dữ liệu tổng quan. Vui lòng thử lại.</p>
        <button
          type="button"
          onClick={reload}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 px-4 h-11 bg-[#008BC5] hover:bg-[#0693E3] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-70"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          Thử lại
        </button>
      </div>
    );
  }

  const canGo = Boolean(onNavigate);
  const go = (tab) => (canGo ? () => onNavigate(tab) : undefined);

  const totalUsers = stats.totalUsers || 0;
  const hasUsers = totalUsers > 0;
  const activeExam = stats.activeExam;

  const roleEntries = Object.entries(ROLE_META).map(([code, meta]) => ({
    code,
    ...meta,
    count: stats.usersByRole?.[code] || 0,
  }));
  const countOf = (code) => roleEntries.find((r) => r.code === code)?.count ?? 0;

  // Việc cần xử lý, theo mức khẩn: thiếu người ra đề / duyệt đề -> chưa có người dự thi -> chỉ 1 quản trị viên
  const actions = [];
  if (countOf('examiner') === 0) {
    actions.push({
      key: 'no-examiner',
      icon: AlertTriangle,
      tone: 'danger',
      title: 'Chưa có Người ra đề nào',
      detail: 'Không ai có thể soạn câu hỏi và tạo đề xuất kỳ thi. Hãy tạo hoặc gán vai trò này cho một tài khoản.',
      cta: 'Quản lý tài khoản',
      tab: 'accounts',
    });
  }
  if (countOf('leader') === 0) {
    actions.push({
      key: 'no-leader',
      icon: AlertTriangle,
      tone: 'danger',
      title: 'Chưa có Người duyệt đề nào',
      detail: 'Đề xuất kỳ thi sẽ không có ai duyệt nên không thể phát hành.',
      cta: 'Quản lý tài khoản',
      tab: 'accounts',
    });
  }
  if (countOf('candidate') === 0) {
    actions.push({
      key: 'no-candidate',
      icon: GraduationCap,
      tone: 'warn',
      title: 'Chưa có Người dự thi nào',
      detail: 'Kỳ thi có phát hành cũng chưa có ai tham gia.',
      cta: 'Quản lý tài khoản',
      tab: 'accounts',
    });
  }
  if (countOf('admin') === 1) {
    actions.push({
      key: 'single-admin',
      icon: Shield,
      tone: 'warn',
      title: 'Chỉ có 1 quản trị viên',
      detail: 'Nếu tài khoản này bị khóa hoặc mất mật khẩu thì không còn ai quản trị hệ thống.',
      cta: 'Quản lý tài khoản',
      tab: 'accounts',
    });
  }

  return (
    <div className="animate-fade-in-up space-y-4 sm:space-y-5" style={{ '--stagger-delay': '0ms' }}>
      {/* Đầu trang: tiêu đề + mốc cập nhật + làm mới */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#0F172A]">Tổng quan hệ thống</h2>
        <div className="flex items-center gap-2 shrink-0">
          {updatedAt && <span className="hidden sm:inline text-sm text-[#334155] tabular-nums">Cập nhật lúc {formatTime(updatedAt)}</span>}
          <button
            type="button"
            onClick={reload}
            disabled={refreshing}
            aria-label="Làm mới dữ liệu tổng quan"
            className="inline-flex items-center justify-center gap-2 px-3 h-11 min-w-[44px] rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#008BC5] transition-colors disabled:opacity-70"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {/* Lần làm mới thất bại nhưng vẫn còn số liệu cũ */}
      {error && (
        <div role="alert" className="bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg p-3 flex items-center gap-3 text-sm">
          <ServerCrash className="w-4 h-4 shrink-0 text-[#E53E3E]" aria-hidden="true" />
          <p className="font-medium">Làm mới thất bại, đang hiển thị số liệu cũ{updatedAt ? ` (lúc ${formatTime(updatedAt)})` : ''}.</p>
        </div>
      )}

      {/* 1. Việc cần xử lý */}
      <section
        className={`bg-white rounded-xl border border-slate-200 shadow-z176 p-4 sm:p-5 border-l-4 ${
          actions.length > 0 ? 'border-l-[#F6AD37]' : 'border-l-[#22C55E]'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          {actions.length > 0 ? (
            <AlertTriangle className="w-5 h-5 text-[#F6AD37]" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-[#22C55E]" aria-hidden="true" />
          )}
          <h3 className="text-base font-bold text-[#0F172A]">
            {actions.length > 0 ? `Việc cần xử lý (${actions.length})` : 'Hệ thống ổn định'}
          </h3>
        </div>
        {actions.length > 0 ? (
          <div className="space-y-2">
            {actions.map((a) => (
              <ActionRow key={a.key} icon={a.icon} tone={a.tone} title={a.title} detail={a.detail} cta={a.cta} onClick={go(a.tab)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#334155]">Đã có đủ các vai trò cần thiết để vận hành: ra đề, duyệt đề và dự thi.</p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* 2. Tài khoản theo vai trò */}
        <Panel title="Tài khoản" hint="Phân bổ theo vai trò. Bấm vào một vai trò để quản lý tài khoản.">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-[#006BA1] text-white flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-[#334155]">Tổng số tài khoản</p>
                <p className="text-3xl font-bold text-[#0F172A] leading-none mt-1 tabular-nums">{totalUsers}</p>
              </div>
            </div>
          </div>

          {hasUsers ? (
            <div
              className="flex h-2.5 rounded-full bg-slate-200 overflow-hidden mt-4"
              role="img"
              aria-label={`Phân bổ ${totalUsers} tài khoản: ${roleEntries.map((r) => `${r.label} ${r.count}`).join(', ')}`}
            >
              {roleEntries.map((r) =>
                r.count > 0 ? (
                  <div key={r.code} className={BAR_CLASSES[r.color]} style={{ width: `${(r.count / totalUsers) * 100}%` }} />
                ) : null,
              )}
            </div>
          ) : (
            <p className="text-sm text-[#64748B] py-6 text-center">Chưa có tài khoản nào trong hệ thống.</p>
          )}

          <ul className="mt-3 divide-y divide-slate-100">
            {roleEntries.map(({ code, label, icon: Icon, color, count }) => {
              const pct = hasUsers ? Math.round((count / totalUsers) * 100) : 0;
              const row = (
                <>
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${COLOR_CLASSES[color]}`}>
                    <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0 text-left text-sm font-medium text-[#334155] truncate">{label}</span>
                  <span className="text-sm text-[#334155] tabular-nums w-10 text-right">{pct}%</span>
                  <span className={`w-10 text-right text-base font-bold tabular-nums ${count === 0 ? 'text-[#64748B]' : 'text-[#0F172A]'}`}>{count}</span>
                </>
              );
              return (
                <li key={code}>
                  {canGo ? (
                    <button
                      type="button"
                      onClick={go('accounts')}
                      className="w-full flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-slate-50 transition-colors min-h-[52px]"
                    >
                      {row}
                    </button>
                  ) : (
                    <div className="w-full flex items-center gap-3 py-2 px-1 min-h-[52px]">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-4 sm:space-y-5">
          {/* 3. Kỳ thi đang diễn ra */}
          <Panel title="Kỳ thi đang diễn ra">
            <div className={`flex items-center gap-3 rounded-lg p-3 min-h-[56px] ${activeExam ? 'bg-[#166534] text-white' : 'border border-slate-200'}`}>
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                {activeExam && <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${activeExam ? 'bg-white' : 'bg-slate-300'}`} />
              </span>
              {activeExam ? (
                <p className="flex-1 min-w-0 text-base font-semibold truncate" title={activeExam.title}>
                  {activeExam.title}
                </p>
              ) : (
                <p className="text-sm text-[#334155]">Hiện không có kỳ thi nào đang diễn ra.</p>
              )}
              <span
                className={`shrink-0 px-2.5 py-1 rounded-lg text-sm font-semibold ${
                  activeExam ? 'bg-white text-[#166534]' : 'bg-[#F6F8FA] text-[#334155]'
                }`}
              >
                {activeExam ? 'Đang diễn ra' : 'Trống'}
              </span>
            </div>
          </Panel>

          {/* 4. Sao lưu dữ liệu */}
          <Panel title="Sao lưu dữ liệu" hint="Demo: lưu tạm trên Google Drive.">
            <button
              type="button"
              onClick={handleBackup}
              disabled={backupLoading}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 min-h-[44px] bg-[#008BC5] hover:bg-[#0693E3] text-white rounded-lg font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008BC5]"
            >
              {backupLoading ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Cloud className="w-5 h-5" aria-hidden="true" />}
              <span>{backupLoading ? 'Đang sao lưu…' : 'Backup dữ liệu'}</span>
            </button>

            {backupResult && (
              <div
                role={backupResult.success ? 'status' : 'alert'}
                className={`mt-3 p-3 rounded-lg flex items-start gap-3 border border-l-4 ${
                  backupResult.success
                    ? 'bg-[#F0FDF4] border-[#22C55E]/40 border-l-[#22C55E] text-[#0F172A]'
                    : 'bg-[#FEECEC] border-[#E53E3E]/40 border-l-[#E53E3E] text-[#0F172A]'
                }`}
              >
                {backupResult.success ? (
                  <CheckCircle className="w-5 h-5 shrink-0 text-[#16A34A]" aria-hidden="true" />
                ) : (
                  <ServerCrash className="w-5 h-5 shrink-0 text-[#C53030]" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{backupResult.message}</p>
                  {backupResult.downloadUrl && (
                    <a
                      href={backupResult.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline mt-1 inline-block py-1 text-[#16A34A] hover:text-[#22C55E]"
                    >
                      Xem file trên Google Drive
                    </a>
                  )}
                </div>
              </div>
            )}

            {canGo && (
              <button
                type="button"
                onClick={go('backup')}
                className="mt-3 flex items-center gap-1 text-sm font-semibold text-[#008BC5] hover:underline min-h-[44px]"
              >
                Mở Sao lưu &amp; Phục hồi
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
};