import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  Signal,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { AvatarComponent } from '../../shared/avatar.component';
import { IconComponent } from '../../shared/icon.component';
import { formatFileSize } from '../../shared/text.util';
import { Attachment, Conversation, Message } from '../chat.models';

interface MediaItem {
  id: string;
  attachment: Attachment;
  sizeLabel: string;
}

const DRAWER_QUERY = '(width < 1280px)';
const FOCUSABLE = 'button, [href], input, [tabindex]:not([tabindex="-1"])';

@Component({
  selector: 'app-info-panel',
  standalone: true,
  imports: [TranslocoPipe, AvatarComponent, IconComponent],
  templateUrl: './info-panel.component.html',
  styleUrl: './info-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoPanelComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true })
  set conversation(value: Conversation) {
    this.conversationSignal.set(value);
  }

  @Input({ required: true })
  set messages(value: Message[]) {
    this.messagesSignal.set(value);
  }

  @Output() closed = new EventEmitter<void>();

  @ViewChild('panel') private readonly panel?: ElementRef<HTMLElement>;

  readonly conversationSignal = signal<Conversation | null>(null);
  private readonly messagesSignal = signal<Message[]>([]);

  readonly images: Signal<MediaItem[]> = computed(() => this.pick('image'));
  readonly files: Signal<MediaItem[]> = computed(() => this.pick('file'));

  /** Dưới 1280px panel là drawer phủ lên chat: cần focus trap + Esc. */
  readonly drawer = signal(false);

  private readonly media = window.matchMedia(DRAWER_QUERY);
  private readonly onMediaChange = (event: MediaQueryListEvent): void => this.drawer.set(event.matches);
  private readonly opener = document.activeElement as HTMLElement | null;

  constructor() {
    this.drawer.set(this.media.matches);
    this.media.addEventListener('change', this.onMediaChange);
  }

  ngAfterViewInit(): void {
    if (this.drawer()) {
      this.panel?.nativeElement.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }
  }

  ngOnDestroy(): void {
    this.media.removeEventListener('change', this.onMediaChange);
    // Trả focus về nút đã mở drawer.
    if (this.drawer()) {
      this.opener?.focus?.();
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.drawer()) {
      return;
    }
    if (event.key === 'Escape') {
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const items = Array.from(this.panel?.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (!items.length) {
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private pick(type: 'image' | 'file'): MediaItem[] {
    return this.messagesSignal()
      .filter((m) => m.type === type && !!m.attachment)
      .map((m) => ({
        id: m.id,
        attachment: m.attachment as Attachment,
        sizeLabel: formatFileSize(m.attachment?.size ?? 0),
      }));
  }
}
