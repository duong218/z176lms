// Chấm số đỏ cạnh mục menu (vd. số kỳ thi đang chờ duyệt). Không hiện khi count = 0.
export const TabBadge = ({ count, className = '' }) =>
  count > 0 ? (
    <span
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#E53E3E] text-white text-xs font-bold leading-none ${className}`}
      aria-label={`${count} việc đang chờ`}
    >
      {count > 99 ? '99+' : count}
    </span>
  ) : null;