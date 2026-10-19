import { Children, Fragment, isValidElement, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Dropdown tự vẽ dùng chung, thay <select> gốc: danh sách rộng đúng bằng ô chọn, tên dài tự xuống dòng,
 * cao tối đa 256px rồi cuộn → không bao giờ tràn khỏi màn hình mobile.
 *
 * <Select> nhận API giống <select>/<option>/<optgroup> (value, onChange(e.target.value), name, required, disabled,
 * aria-label, className) nên đổi thẻ là xong. <SelectBox items> là dạng dữ liệu: { value, label, disabled, badge } | { heading }.
 * badge: nhãn nhỏ + tô nổi bật dòng đó (vd. chủ đề đang phát hành).
 */
const text = (c) => Children.toArray(c).join('');

function toItems(children) {
  const out = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === Fragment) out.push(...toItems(c.props.children));
    else if (c.type === 'optgroup') out.push({ heading: c.props.label }, ...toItems(c.props.children));
    else if (c.type === 'option') {
      out.push({ value: String(c.props.value ?? text(c.props.children)), label: text(c.props.children), disabled: c.props.disabled });
    }
  });
  return out;
}

const DEFAULT_CLS =
  'w-full min-w-0 max-w-full px-3 py-2 border border-slate-300 rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#008BC5]/40';

export const SelectBox = ({ value, onChange, items, name, required, disabled, className = DEFAULT_CLS, 'aria-label': ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const val = String(value ?? '');
  const current = items.find((i) => !i.heading && i.value === val);
  const pick = (i) => {
    if (i.disabled) return;
    onChange(i.value);
    setOpen(false);
  };
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:opacity-60`}
      >
        <span className="min-w-0 truncate">{current?.label ?? items.find((i) => !i.heading)?.label ?? ''}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-slate-500" />
      </button>
      {required && <input required name={name} value={val} onChange={() => {}} tabIndex={-1} aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px opacity-0 pointer-events-none" />}
      {open && (
        <ul role="listbox" className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-300 rounded-lg shadow-lg py-1">
          {items.map((i, idx) =>
            i.heading ? (
              <li key={`h${idx}`} className="px-3 pt-2 pb-1 text-xs font-bold uppercase text-slate-500">
                {i.heading}
              </li>
            ) : (
              <li
                key={`${i.value}-${idx}`}
                role="option"
                aria-selected={i.value === val}
                aria-disabled={i.disabled}
                onClick={() => pick(i)}
                className={`px-3 py-2.5 text-base text-[#0F172A] break-words min-h-[44px] flex items-center justify-between gap-2 ${
                  i.disabled ? 'text-slate-400' : 'cursor-pointer hover:bg-[#E6F4FA]'
                } ${i.badge ? 'bg-[#F0FDF4] border-l-4 border-[#22C55E]' : ''} ${
                  i.value === val ? 'bg-[#E6F4FA] font-semibold text-[#008BC5]' : ''
                }`}
              >
                <span className="min-w-0">{i.label}</span>
                {i.badge && (
                  <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#22C55E] text-white">{i.badge}</span>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
};

// Drop-in cho <select>: onChange nhận { target: { name, value } } như sự kiện gốc.
export const Select = ({ children, onChange, name, ...rest }) => (
  <SelectBox {...rest} name={name} items={toItems(children)} onChange={(value) => onChange?.({ target: { name, value } })} />
);

export default Select;