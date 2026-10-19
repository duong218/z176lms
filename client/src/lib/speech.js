// Chuẩn bị chữ của AI để loa đọc (Web Speech API có sẵn của trình duyệt).
// Bỏ khối ``` (sơ đồ/code), dấu markdown (**, #, ...); bảng thì đọc từng ô cách nhau dấu phẩy.
const SEP_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm; // dòng phân cách bảng |---|---|

export const toSpeech = (text) =>
  String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(SEP_ROW, '')
    .replace(/^\s*\||\|\s*$/gm, '')
    .replace(/\|/g, ', ')
    .replace(/\*\*|[*_#`>]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

// Cắt theo câu/dòng: trình duyệt (Chrome) hay tự ngắt khi đọc 1 đoạn quá dài.
export const speechChunks = (text) =>
  toSpeech(text)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);