// Nút chọn "Đơn giản / Nhiều màu". Dùng cùng hook useColorLook (nhớ theo thiết bị).
export const LookToggle = ({ colorful, onChange }) => (
  <div role="group" aria-label="Kiểu giao diện">
    <div className="text-sm font-semibold text-[#334155] mb-1">Kiểu giao diện</div>
    <div className="inline-flex rounded-[10px] border border-[#E2E8F0] bg-white p-1 gap-1">
      {[
        { v: false, label: 'Đơn giản' },
        { v: true, label: 'Nhiều màu' },
      ].map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={colorful === o.v}
          className={`min-h-[44px] px-4 rounded-lg text-base font-semibold transition-colors ${
            colorful === o.v ? 'bg-[#008BC5] text-white' : 'text-[#334155] hover:bg-[#F6F8FA]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);