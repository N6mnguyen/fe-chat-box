import { ChangeDetectionStrategy, Component, HostListener, Input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { AvatarComponent } from '../../shared/avatar.component';
import { IconComponent, IconName } from '../../shared/icon.component';
import { AppearanceMenuComponent } from '../appearance-menu/appearance-menu.component';

interface NavItem {
  key: string;
  icon: IconName;
  /** Chưa có tính năng: hiển thị "Sắp có" và không chọn được. */
  soon: boolean;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    titleKey: 'nav.inbox',
    items: [
      { key: 'messages', icon: 'inbox', soon: false },
      { key: 'other', icon: 'archive', soon: true },
      { key: 'unread', icon: 'bubble', soon: true },
      { key: 'strangers', icon: 'user', soon: true },
      { key: 'hidden', icon: 'eye-off', soon: true },
    ],
  },
  { titleKey: 'nav.storage', items: [{ key: 'cloud', icon: 'cloud', soon: true }] },
  {
    titleKey: 'nav.contacts',
    items: [
      { key: 'friends', icon: 'user', soon: true },
      { key: 'groups', icon: 'users', soon: true },
      { key: 'requests', icon: 'user-plus', soon: true },
    ],
  },
];

/**
 * Điều hướng chính. Desktop rộng: sidebar đầy đủ; vừa: cột icon 64px; mobile: thanh dưới.
 * Chỉ "Tin nhắn" đã làm, các mục khác ghi "Sắp có".
 */
@Component({
  selector: 'app-nav-sidebar',
  standalone: true,
  imports: [TranslocoPipe, AvatarComponent, IconComponent, AppearanceMenuComponent],
  templateUrl: './nav-sidebar.component.html',
  styleUrl: './nav-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavSidebarComponent {
  @Input() unread = 0;
  @Input() userName = '';

  readonly sections = SECTIONS;
  readonly appearanceOpen = signal(false);
  /** Các nhóm đang thu gọn (theo titleKey). */
  readonly collapsed = signal<ReadonlySet<string>>(new Set());

  toggleAppearance(): void {
    this.appearanceOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  closeAppearanceOnOutsideClick(event: MouseEvent): void {
    if (!this.appearanceOpen() || !(event.target instanceof Element)) {
      return;
    }

    if (!event.target.closest('.nav__menu, .me__settings')) {
      this.appearanceOpen.set(false);
    }
  }

  toggleSection(titleKey: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (!next.delete(titleKey)) {
        next.add(titleKey);
      }
      return next;
    });
  }

  unreadLabel(count: number): string {
    return count > 99 ? '99+' : String(count);
  }
}
