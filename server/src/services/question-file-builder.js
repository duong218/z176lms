/**
 * Dựng file câu hỏi (Word / Excel) ĐÚNG khuôn import của hệ thống, từ danh sách câu hỏi đã được server kiểm tra.
 * AI không bao giờ tự tạo file: nó chỉ trả nội dung câu hỏi, còn tên cột / khuôn dòng / mã bộ phận do server điền.
 *   - Word: "Câu N: (chủ đề: ... - bộ phận: MÃ - độ khó: ...) Nội dung", đáp án đúng đánh dấu bằng dấu * (xem question.service.js)
 *   - Excel: sheet đầu tiên "Câu hỏi" với đúng các cột của file mẫu Mau_Import_Cau_Hoi_Z176.xlsx
 */

import JSZip from 'jszip';
import XLSX from 'xlsx';

export const DIFFICULTY_LABEL = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' };

const LETTERS = 'ABCDEFGH';

const escXml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function run(text, { bold = false, italic = false, color } = {}) {
  const props =
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
    (bold ? '<w:b/>' : '') +
    (italic ? '<w:i/>' : '') +
    (color ? `<w:color w:val="${color}"/>` : '') +
    '<w:sz w:val="26"/>';
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${escXml(text)}</w:t></w:r>`;
}

function para(runs, { before = 0, left = 0 } = {}) {
  const ind = left ? `<w:ind w:left="${left}"/>` : '';
  return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="0"/>${ind}</w:pPr>${runs}</w:p>`;
}

/**
 * @param {Array<{content:string, options:string[], correct:number, difficulty:'easy'|'medium'|'hard'}>} questions
 * @param {{topicName:string, deptCode?:string, sourceTitle:string}} meta
 * @returns {Promise<Buffer>}
 */
export async function buildQuestionsDocx(questions, { topicName, deptCode = '', sourceTitle }) {
  const body = [];
  // Đoạn trước câu hỏi đầu tiên sẽ bị bộ import bỏ qua → dùng làm ghi chú cho người tạo đề
  body.push(
    para(
      run(
        `LƯU Ý: Câu hỏi do AI soạn từ tài liệu "${sourceTitle}". Hãy đọc lại và sửa nội dung, đáp án trước khi import. ` +
          'Đáp án đúng có dấu * ở đầu dòng (chữ xanh).',
        { italic: true, color: 'C0392B' },
      ),
    ),
  );

  questions.forEach((q, i) => {
    const head = `Câu ${i + 1}: (chủ đề: ${topicName} - bộ phận: ${deptCode} - độ khó: ${DIFFICULTY_LABEL[q.difficulty]}) ${q.content}`;
    body.push(para(run(head, { bold: true }), { before: 240 }));
    q.options.forEach((opt, idx) => {
      const isCorrect = idx + 1 === q.correct;
      const text = `${isCorrect ? '*' : ''}${LETTERS[idx]}. ${opt}`;
      body.push(para(run(text, isCorrect ? { color: '1B7F3B' } : {}), { left: 567 }));
    });
  });

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Đúng thứ tự và tên cột của sheet "Câu hỏi" trong file mẫu Mau_Import_Cau_Hoi_Z176.xlsx
const XLSX_HEADERS = [
  'Chủ đề', 'Nội dung', 'Phạm vi', 'Mã bộ phận', 'Bộ phận', 'Loại', 'Đáp án', 'Độ khó',
  'Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4', 'Lựa chọn 5', 'Lựa chọn 6', 'Lựa chọn 7', 'Lựa chọn 8',
  'Đáp án đúng',
];

/**
 * @param {{topicName:string, deptCode?:string, deptName?:string, sourceTitle:string}} meta
 * @returns {Buffer}
 */
export function buildQuestionsXlsx(questions, { topicName, deptCode = '', deptName = '', sourceTitle }) {
  const isDept = Boolean(deptCode);
  const rows = questions.map((q) => {
    const opts = Array.from({ length: 8 }, (_, i) => q.options[i] ?? '');
    return [
      topicName,
      q.content,
      isDept ? 'riêng' : 'chung',
      deptCode,
      isDept ? deptName : '',
      'lý thuyết',
      'chọn 1',
      DIFFICULTY_LABEL[q.difficulty].toLowerCase(),
      ...opts,
      String(q.correct),
    ];
  });
  const wb = XLSX.utils.book_new();
  // Sheet dữ liệu PHẢI đứng đầu: bộ import đọc sheet đầu tiên
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([XLSX_HEADERS, ...rows]), 'Câu hỏi');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['LƯU Ý'],
      [`Câu hỏi do AI soạn từ tài liệu "${sourceTitle}". Hãy đọc lại và sửa nội dung, đáp án trước khi import.`],
      ['Giữ nguyên tên cột và các giá trị như "chung/riêng", "lý thuyết", "chọn 1", "dễ/trung bình/khó" khi sửa.'],
    ]),
    'GhiChu',
  );
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}