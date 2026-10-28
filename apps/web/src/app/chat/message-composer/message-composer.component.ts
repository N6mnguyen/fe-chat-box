import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';

import { IconComponent } from '../../shared/icon.component';
import { formatFileSize } from '../../shared/text.util';
import { Message, OutgoingMessage, ReplyRef } from '../chat.models';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const EMOJIS = ['😀', '😂', '😍', '🥰', '😎', '🤔', '😭', '😡', '👍', '🙏', '👏', '🎉', '❤️', '🔥', '✅', '😅'];

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [ReactiveFormsModule, TranslocoPipe, IconComponent],
  templateUrl: './message-composer.component.html',
  styleUrl: './message-composer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageComposerComponent {
  /** Đang gửi: khóa nút gửi. */
  @Input() sending = false;
  @Input() errorKey = '';
  @Input() replyMessage: Message | null = null;

  @Output() messageSent = new EventEmitter<OutgoingMessage>();
  @Output() replyCancelled = new EventEmitter<void>();

  readonly emojis = EMOJIS;

  readonly form = new FormGroup({
    content: new FormControl('', { nonNullable: true }),
  });

  readonly files = signal<File[]>([]);
  readonly emojiOpen = signal(false);
  readonly fileError = signal(false);

  get canSend(): boolean {
    return (
      !this.sending && (this.form.controls.content.value.trim().length > 0 || this.files().length > 0)
    );
  }

  /** Enter gửi, Shift+Enter xuống dòng; bỏ qua khi đang gõ tiếng Việt bằng IME. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.replyMessage) {
      this.replyCancelled.emit();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
      return;
    }
    event.preventDefault();
    this.submit();
  }

  submit(): void {
    if (!this.canSend) {
      return;
    }
    const replyTo: ReplyRef | undefined = this.replyMessage
      ? {
          messageId: this.replyMessage.id,
          senderName: this.replyMessage.senderName,
          text: this.replyMessage.content || this.replyMessage.attachment?.name || '',
        }
      : undefined;
    this.messageSent.emit({
      content: this.form.controls.content.value,
      files: this.files(),
      replyTo,
    });
    this.replyCancelled.emit();
    this.form.reset();
    this.files.set([]);
    this.emojiOpen.set(false);
  }

  toggleEmoji(): void {
    this.emojiOpen.update((open) => !open);
  }

  addEmoji(emoji: string): void {
    const control = this.form.controls.content;
    control.setValue(control.value + emoji);
  }

  onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    const valid = picked.filter((f) => f.size <= MAX_FILE_BYTES);
    this.fileError.set(valid.length !== picked.length);
    this.files.update((current) => [...current, ...valid]);
  }

  removeFile(index: number): void {
    this.files.update((current) => current.filter((_, i) => i !== index));
  }

  sizeLabel(bytes: number): string {
    return formatFileSize(bytes);
  }
}
