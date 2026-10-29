import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Kiểm tra tương phản WCAG AA (>= 4.5:1) cho cặp màu chữ/nền trong design tokens. */
function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? [...v].map((c) => c + c).join('') : v;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function readTokens(mixin: string): Record<string, string> {
  const css = readFileSync(join(process.cwd(), 'apps/web/src/styles.scss'), 'utf8');
  const block = new RegExp(`@mixin ${mixin} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const tokens: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6});/g)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

const TEXT_ON: [string, string][] = [
  ['color-text', 'color-bg'],
  ['color-text', 'color-list-bg'],
  ['color-text', 'color-primary-soft'],
  ['color-text-muted', 'color-bg'],
  ['color-text-muted', 'color-list-bg'],
  ['color-text-muted', 'color-sidebar-bg'],
  ['color-text-muted', 'color-chat-bg'],
  ['color-text-muted', 'color-raised'],
  ['color-text-muted', 'color-bg-subtle'],
  ['color-text-muted', 'color-primary-soft'],
  ['color-link', 'color-bg'],
  ['color-link', 'color-primary-soft'],
  ['color-link', 'color-bubble-other'],
  ['color-primary-contrast', 'color-primary'],
  ['color-danger-contrast', 'color-danger'],
  ['color-bubble-mine-text', 'color-bubble-mine'],
  ['color-text', 'color-bubble-other'],
  ['color-danger', 'color-bg'],
];

describe.each(['light-tokens', 'dark-tokens'])('tương phản %s', (mixin) => {
  const tokens = readTokens(mixin);

  it.each(TEXT_ON)('%s trên %s >= 4.5', (fg, bg) => {
    expect(tokens[fg], `thiếu ${fg}`).toBeDefined();
    expect(tokens[bg], `thiếu ${bg}`).toBeDefined();
    expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
