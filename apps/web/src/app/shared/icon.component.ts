import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type IconName =
  | 'search'
  | 'phone'
  | 'video'
  | 'info'
  | 'back'
  | 'close'
  | 'send'
  | 'emoji'
  | 'image'
  | 'attach'
  | 'file'
  | 'check'
  | 'checks'
  | 'clock'
  | 'alert'
  | 'bell'
  | 'bell-off'
  | 'pin'
  | 'inbox'
  | 'archive'
  | 'bubble'
  | 'user'
  | 'eye-off'
  | 'cloud'
  | 'users'
  | 'user-plus'
  | 'settings'
  | 'panel'
  | 'download'
  | 'arrow-down'
  | 'plus'
  | 'more'
  | 'retry'
  | 'edit'
  | 'reply'
  | 'forward'
  | 'trash'
  | 'logout';

// Đường vẽ SVG (viewBox 24x24, nét 2px) để icon đồng nhất, không cần thư viện.
const PATHS: Record<IconName, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3',
  phone:
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  video: 'M3 7h11v10H3zM14 11l7-4v10l-7-4',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 8v5m0-8.5v.5',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  send: 'M3 11l18-8-8 18-2-7-8-3z',
  emoji: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4 4 0 0 0 7 0M9 9.5v.5m6-.5v.5',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5v.01',
  attach: 'M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6',
  check: 'M5 12l5 5 9-10',
  checks: 'M2 12l5 5 8-10M11 15l1 1.5L21 7',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v4l3 2',
  alert: 'M12 3l10 18H2zM12 10v5m0 2.5v.5',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  'bell-off': 'M4 4l16 16M8 8a4 4 0 0 0-1 3v4l-2 2h12M10 20a2 2 0 0 0 4 0M16 12V9a4 4 0 0 0-5-4',
  pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v8',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  bubble: 'M4 5h16v11H9l-5 4z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20a8 8 0 0 1 16 0',
  'eye-off':
    'M4 4l16 16M10 6.2A9 9 0 0 1 12 6c5 0 8 6 8 6a14 14 0 0 1-3 3.5M6.5 8A14 14 0 0 0 4 12s3 6 8 6c1 0 2-.2 3-.6M10 10a3 3 0 0 0 4 4',
  cloud: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a7 7 0 0 1 4 6',
  'user-plus': 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 20a7 7 0 0 1 14 0M19 8v6m-3-3h6',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6',
  panel: 'M4 5h16v14H4zM15 5v14',
  download: 'M12 4v11m-4-4l4 4 4-4M5 20h14',
  'arrow-down': 'M12 5v14m-6-6l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  retry: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  reply: 'M9 8L4 12l5 4M4 12h10a6 6 0 0 1 6 6',
  forward: 'M15 8l5 4-5 4m5-4H10a6 6 0 0 0-6 6',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};

/** Icon SVG dùng chung; chỉ trang trí nên ẩn khỏi trình đọc màn hình (nút bao ngoài có aria-label). */
@Component({
  selector: 'app-icon',
  standalone: true,
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  path = '';

  @Input({ required: true }) set name(value: IconName) {
    this.path = PATHS[value];
  }
}
