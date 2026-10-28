import { Pipe, PipeTransform } from '@angular/core';

export interface RelativeTime {
  /** Khóa i18n; rỗng khi dùng `text` (dd/mm). */
  key: string;
  params: { n: number };
  text: string;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Thời gian rút gọn kiểu Việt Nam: vừa xong, 5 phút, 2 giờ, hôm qua, dd/mm. */
@Pipe({ name: 'relativeTime', standalone: true })
export class RelativeTimePipe implements PipeTransform {
  transform(timestamp: number): RelativeTime {
    const now = Date.now();
    const minutes = Math.floor((now - timestamp) / MINUTE);
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);

    if (minutes < 1) {
      return { key: 'time.now', params: { n: 0 }, text: '' };
    }
    if (minutes < 60) {
      return { key: 'time.minutes', params: { n: minutes }, text: '' };
    }
    if (timestamp >= startOfToday) {
      return { key: 'time.hours', params: { n: Math.floor((now - timestamp) / HOUR) }, text: '' };
    }
    if (timestamp >= startOfToday - DAY) {
      return { key: 'time.yesterday', params: { n: 0 }, text: '' };
    }
    const date = new Date(timestamp);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return { key: '', params: { n: 0 }, text: `${dd}/${mm}` };
  }
}
