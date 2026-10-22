import { useEffect } from 'react';
import { Loader2, CheckCircle, ServerCrash, X } from 'lucide-react';
import { useBackupJob, resumeBackup, dismissBackup } from '../../services/backup-job.store';

const PHASE_LABEL = {
  dump: 'Đang xuất dữ liệu từ cơ sở dữ liệu…',
  encrypt: 'Đang mã hóa bản sao lưu…',
  upload: 'Đang tải lên Google Drive…',
  rotate: 'Đang dọn các bản sao lưu cũ…',
};

// Thẻ tiến độ nổi góc dưới phải, hiện ở MỌI mục của dashboard quản trị (đổi tab không mất).
// Pha "dump" (mongodump) không báo % thật nên hiện thanh chạy thay vì số.
export const BackupProgressCard = () => {
  const { state, phase, percent, message, result } = useBackupJob();
  useEffect(() => {
    resumeBackup();
  }, []);
  if (state === 'idle') return null;

  const running = state === 'running';
  const done = state === 'done';
  const indeterminate = running && (phase === 'dump' || !phase);
  const tone = running ? 'border-[#008BC5]/40' : done ? 'border-[#22C55E]/50' : 'border-[#E53E3E]/50';
  const Icon = running ? Loader2 : done ? CheckCircle : ServerCrash;
  const iconCls = running ? 'text-[#008BC5] animate-spin' : done ? 'text-[#16A34A]' : 'text-[#C53030]';

  return (
    <div
      role={state === 'error' ? 'alert' : 'status'}
      className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[22rem] z-40 bg-white rounded-xl shadow-lg border ${tone} p-4`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-6 h-6 shrink-0 ${iconCls}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[#0F172A] text-base">
            {running ? `Đang sao lưu dữ liệu${indeterminate ? '' : ` ${percent}%`}` : done ? 'Sao lưu hoàn tất' : 'Sao lưu thất bại'}
          </p>
          {running ? (
            <>
              <p className="text-sm text-[#334155] mt-0.5">{PHASE_LABEL[phase] || PHASE_LABEL.dump}</p>
              <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : percent}>
                <div
                  className={`h-full bg-[#008BC5] ${indeterminate ? 'w-1/3 animate-pulse' : 'transition-all duration-500'}`}
                  style={indeterminate ? undefined : { width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-[#475569] mt-3">
                Bạn có thể chuyển sang mục khác, sao lưu vẫn tiếp tục. Tránh tải lại hoặc đóng trang cho tới khi xong.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-[#334155] mt-0.5 break-words">{message}</p>
              {done && result?.id && (
                <a
                  href={`https://drive.google.com/file/d/${result.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline mt-1 inline-block py-1 text-[#16A34A] hover:text-[#22C55E]"
                >
                  Xem file trên Google Drive
                </a>
              )}
            </>
          )}
        </div>
        {!running && (
          <button
            type="button"
            onClick={dismissBackup}
            aria-label="Đóng"
            className="w-9 h-9 -mr-2 -mt-2 flex items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F6F8FA] shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};