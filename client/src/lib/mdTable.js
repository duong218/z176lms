// Tách chữ của AI thành các khối: chữ thường và bảng markdown
// (dòng đầu bắt đầu bằng "|", dòng kế tiếp là dòng phân cách |---|---|).
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isSep = (line = '') => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const isRow = (line = '') => line.trim().startsWith('|');

export function splitTables(text) {
  const lines = text.split('\n');
  const blocks = [];
  let buf = [];
  const flush = () => {
    if (buf.length) blocks.push({ type: 'text', text: buf.join('\n') });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (isRow(lines[i]) && isSep(lines[i + 1])) {
      flush();
      const head = cells(lines[i]);
      const rows = [];
      for (i += 2; isRow(lines[i]); i++) rows.push(cells(lines[i]));
      i--; // vòng for ngoài sẽ ++ lại, trả i về đúng dòng không thuộc bảng
      blocks.push({ type: 'table', head, rows });
    } else buf.push(lines[i]);
  }
  flush();
  return blocks;
}