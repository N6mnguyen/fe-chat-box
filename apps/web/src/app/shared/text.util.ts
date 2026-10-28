/** Chuẩn hóa chuỗi để tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

export interface TextPart {
  text: string;
  url: string | null;
}

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/** Tách link an toàn (chỉ http/https), không dùng innerHTML. */
export function splitLinks(text: string): TextPart[] {
  return text
    .split(URL_PATTERN)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, url: /^https?:\/\//.test(part) ? part : null }));
}

/** Định dạng dung lượng tệp dễ đọc (KB/MB/GB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
