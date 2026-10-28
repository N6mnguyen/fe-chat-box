import { formatFileSize, normalizeText } from './text.util';

describe('text.util', () => {
  it('bỏ dấu tiếng Việt và đ', () => {
    expect(normalizeText('Nguyễn Đặng Thị Lan')).toBe('nguyen dang thi lan');
  });

  it('định dạng dung lượng', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(3_400_000)).toBe('3.2 MB');
  });
});
