import { useState, useEffect, useRef } from 'react';
import {
  Cloud,
  Download,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ServerCrash,
  CheckCircle,
  UploadCloud,
  RefreshCw,
  FileArchive,
  WifiOff,
} from 'lucide-react';
import { fetchBackups, downloadBackupFile, restoreBackupFile } from '../../services/admin.service';

// Cụm từ bắt buộc gõ đúng (không dấu, dễ gõ) trước khi cho phép bấm khôi
// phục — thao tác này mongorestore --drop XOÁ TOÀN BỘ dữ liệu hiện tại rồi
// ghi đè, không có đường lùi, nên chỉ 1 nút "Xác nhận" bình thường là chưa
// đủ an toàn cho 1 thao tác nghiêm trọng như thế này.
const CONFIRM_PHRASE = 'XOA DU LIEU HIEN TAI';

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const BackupTab = () => {
  const [items, setItems] = useState([]);
  const [maxKept, setMaxKept] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  // Chọn file trước khi khôi phục
  const [selectedFile, setSelectedFile] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const fileInputRef = useRef(null);

  // Trạng thái overlay khôi phục — 'idle' | 'uploading' | 'processing' | 'success' | 'error'
  const [restorePhase, setRestorePhase] = useState('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [restoreError, setRestoreError] = useState(null); // { title, detail }
  const cancelRef = useRef(null); // handle huỷ của request XHR đang chạy
  const phaseRef = useRef('idle'); // đọc được giá trị mới nhất trong event listener 'offline'

  const isRestoring = restorePhase === 'uploading' || restorePhase === 'processing';

  const loadBackups = async () => {
    setLoading(true);
    setError('');
    try {
      const { items: list, maxKept: max } = await fetchBackups();
      setItems(list);
      if (max) setMaxKept(max);
    } catch (err) {
      setError(err.message || 'Không tải được danh sách bản sao lưu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  // Cảnh báo trước khi rời trang / đóng tab trong lúc đang khôi phục — đóng
  // tab không dừng được tiến trình restore ở server, nhưng ít nhất tránh
  // admin vô tình rời đi mà không biết trạng thái đang dang dở.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isRestoring) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRestoring]);

  // Phát hiện mất mạng ngay lập tức trong lúc đang khôi phục.
  useEffect(() => {
    const handleOffline = () => {
      if (phaseRef.current !== 'uploading' && phaseRef.current !== 'processing') return;

      const wasUploading = phaseRef.current === 'uploading';
      cancelRef.current?.(); // huỷ request phía client (xem lưu ý trong ghi chú bên dưới)

      setRestorePhase('error');
      phaseRef.current = 'error';
      setRestoreError(
        wasUploading
          ? {
              title: 'Mất kết nối mạng khi đang tải file lên',
              detail:
                'Quá trình khôi phục đã được HUỶ AN TOÀN — máy chủ chưa nhận đủ file nên chưa xử lý gì. Vui lòng kiểm tra lại kết nối mạng rồi khôi phục lại từ đầu.',
            }
          : {
              title: 'Mất kết nối mạng khi máy chủ đang xử lý',
              detail:
                'File đã tải lên xong và máy chủ có thể ĐANG chạy khôi phục ở phía server — việc mất kết nối ở trình duyệt KHÔNG dừng được tiến trình đó. Không rõ quá trình đã hoàn tất hay chưa. Vui lòng chờ vài phút, kiểm tra lại bằng cách đăng nhập lại hệ thống trước khi thử khôi phục lần nữa, tránh chạy 2 lần khôi phục cùng lúc.',
            },
      );
    };
    window.addEventListener('offline', handleOffline);
    return () => window.removeEventListener('offline', handleOffline);
  }, []);

  const handleDownload = async (item) => {
    setDownloadingId(item.id);
    setError('');
    try {
      await downloadBackupFile(item.id, item.name);
    } catch (err) {
      setError(err.message || 'Tải bản sao lưu thất bại');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] ?? null;
    if (file && !/\.gz(\.enc)?$/.test(file.name)) {
      setError('Chỉ chấp nhận file .gz hoặc .gz.enc (được tạo từ chức năng backup).');
      setSelectedFile(null);
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const canRestore =
    Boolean(selectedFile) && confirmText.trim().toUpperCase() === CONFIRM_PHRASE && restorePhase === 'idle';

  const resetRestoreForm = () => {
    setSelectedFile(null);
    setConfirmText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRestore = () => {
    if (!canRestore) return;

    setUploadProgress(0);
    setRestoreError(null);
    setRestorePhase('uploading');
    phaseRef.current = 'uploading';

    const { promise, cancel } = restoreBackupFile(selectedFile, {
      onUploadProgress: (pct) => setUploadProgress(pct),
      onPhaseChange: (phase) => {
        setRestorePhase(phase);
        phaseRef.current = phase;
      },
    });
    cancelRef.current = cancel;

    promise
      .then(() => {
        setRestorePhase('success');
        phaseRef.current = 'success';
        resetRestoreForm();
        // Toàn bộ dữ liệu (kể cả roles/users) vừa bị ghi đè — reload cứng để
        // app lấy lại state mới hoàn toàn từ đầu (session hiện tại có thể
        // không còn hợp lệ nếu tài khoản admin không có trong bản khôi phục).
        setTimeout(() => window.location.reload(), 2000);
      })
      .catch((err) => {
        // Sự kiện 'offline' có thể đã tự set lỗi trước khi promise reject
        // (do gọi cancel() bên trong) — không ghi đè thông báo cụ thể hơn đó.
        if (phaseRef.current === 'error') return;

        setRestorePhase('error');
        phaseRef.current = 'error';
        const detailByCode = {
          NETWORK_ERROR: 'Kiểm tra lại kết nối mạng hoặc trạng thái máy chủ rồi thử khôi phục lại.',
          ABORTED: 'Quá trình khôi phục đã bị huỷ.',
        };
        setRestoreError({
          title: err.message || 'Khôi phục thất bại',
          detail: detailByCode[err.code] || 'Vui lòng thử khôi phục lại. Nếu lỗi lặp lại, liên hệ quản trị hệ thống.',
        });
      });
  };

  const handleCloseErrorOverlay = () => {
    setRestorePhase('idle');
    phaseRef.current = 'idle';
    setRestoreError(null);
    cancelRef.current = null;
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* DANH SÁCH BẢN SAO LƯU */}
      <div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">Các bản sao lưu trên Google Drive</h3>
            <p className="text-xs text-slate-500 mt-0.5">Hệ thống tự động giữ tối đa {maxKept} bản mới nhất.</p>
          </div>
          <button
            type="button"
            onClick={loadBackups}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 w-full sm:w-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-200 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
            <Cloud className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Chưa có bản sao lưu nào. Bấm "Backup dữ liệu" ở tab Tổng quan để tạo bản đầu tiên.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="animate-fade-in-up flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors"
                style={{ '--stagger-delay': `${Math.min(index, 6) * 50}ms` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#008BC5]/10 text-[#008BC5] flex items-center justify-center shrink-0">
                    <FileArchive className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-[#0F172A] truncate" title={item.name}>
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(item.createdTime)} · {formatBytes(item.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(item)}
                  disabled={downloadingId === item.id}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 shrink-0"
                >
                  {downloadingId === item.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Tải về</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KHÔI PHỤC — vùng nguy hiểm, tách biệt hẳn về mặt hình ảnh.
          MỚI — trễ hơn danh sách backup 1 nhịp để mắt tự nhiên đọc từ trên
          xuống, không phải khối cảnh báo nguy hiểm này giật vào trước. */}
      <div className="animate-fade-in-up border-2 border-[#E53E3E]/30 bg-[#FEECEC]/40 rounded-xl p-4 sm:p-5 space-y-4" style={{ '--stagger-delay': '150ms' }}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-[#E53E3E] shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">Khôi phục dữ liệu</h3>
            <p className="text-sm text-slate-600 mt-1">
              Chọn 1 file sao lưu (.gz) — có thể tải từ danh sách phía trên hoặc file backup đã lưu sẵn trên máy.
              Thao tác này sẽ <b>XOÁ TOÀN BỘ dữ liệu hiện tại</b> và ghi đè bằng dữ liệu trong file, không thể hoàn
              tác. Toàn bộ phiên đăng nhập hiện có (kể cả của chính bạn) có thể bị ảnh hưởng nếu tài khoản không còn
              tồn tại sau khi khôi phục.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">File sao lưu (.gz / .gz.enc)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gz,.enc"
              onChange={handleFileChange}
              disabled={isRestoring}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#008BC5] file:text-white hover:file:bg-[#007ba1] disabled:opacity-50"
            />
            {selectedFile && (
              <p className="text-xs text-slate-500 mt-1.5">
                Đã chọn: <b>{selectedFile.name}</b> ({formatBytes(selectedFile.size)})
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Gõ chính xác <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded text-[#E53E3E]">{CONFIRM_PHRASE}</span> để
              xác nhận
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isRestoring}
              placeholder={CONFIRM_PHRASE}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E53E3E] disabled:bg-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={handleRestore}
            disabled={!canRestore}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-[#E53E3E] text-white rounded-lg font-semibold hover:bg-[#C53030] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UploadCloud className="w-4 h-4" />
            Khôi phục dữ liệu
          </button>
        </div>
      </div>

      {/* OVERLAY TOÀN MÀN HÌNH — chặn thao tác khác trong lúc khôi phục */}
      {restorePhase !== 'idle' && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 text-center">
            {restorePhase === 'uploading' && (
              <>
                <UploadCloud className="w-12 h-12 mx-auto text-[#008BC5] mb-4" />
                <h3 className="text-lg font-bold text-[#0F172A] mb-1">Đang tải file lên máy chủ...</h3>
                <p className="text-sm text-slate-500 mb-5">Vui lòng không tắt trình duyệt hoặc điều hướng đi nơi khác.</p>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#008BC5] transition-all duration-200 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm font-semibold text-[#008BC5] mt-2">{uploadProgress}%</p>
              </>
            )}

            {restorePhase === 'processing' && (
              <>
                <Loader2 className="w-12 h-12 mx-auto text-[#008BC5] mb-4 animate-spin" />
                <h3 className="text-lg font-bold text-[#0F172A] mb-1">Máy chủ đang khôi phục dữ liệu...</h3>
                <p className="text-sm text-slate-500">
                  Đã tải file xong, hệ thống đang ghi đè dữ liệu. Bước này có thể mất vài phút tuỳ dung lượng, không
                  hiển thị được % chính xác. <b>Tuyệt đối không tắt trình duyệt</b> cho đến khi có thông báo.
                </p>
              </>
            )}

            {restorePhase === 'success' && (
              <>
                <CheckCircle className="w-12 h-12 mx-auto text-[#16A34A] mb-4" />
                <h3 className="text-lg font-bold text-[#0F172A] mb-1">Khôi phục dữ liệu thành công!</h3>
                <p className="text-sm text-slate-500">Trang sẽ tự động tải lại trong giây lát...</p>
              </>
            )}

            {restorePhase === 'error' && (
              <>
                {restoreError?.title?.includes('mạng') || restoreError?.title?.includes('Mất kết nối') ? (
                  <WifiOff className="w-12 h-12 mx-auto text-[#E53E3E] mb-4" />
                ) : (
                  <ServerCrash className="w-12 h-12 mx-auto text-[#E53E3E] mb-4" />
                )}
                <h3 className="text-lg font-bold text-[#0F172A] mb-2">{restoreError?.title || 'Khôi phục thất bại'}</h3>
                <p className="text-sm text-slate-600 mb-5 text-left bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg p-3">
                  {restoreError?.detail}
                </p>
                <button
                  type="button"
                  onClick={handleCloseErrorOverlay}
                  className="w-full py-2.5 bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] transition-colors"
                >
                  Đã hiểu, đóng lại
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};