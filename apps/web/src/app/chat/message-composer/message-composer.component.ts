import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';

import { IconComponent } from '../../shared/icon.component';
import { formatFileSize } from '../../shared/text.util';
import { Message, OutgoingMessage, ReplyRef } from '../chat.models';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 20;
const EMOJIS = ['😀', '😂', '😍', '🥰', '😎', '🤔', '😭', '😡', '👍', '🙏', '👏', '🎉', '❤️', '🔥', '✅', '😅'];

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [ReactiveFormsModule, TranslocoPipe, IconComponent],
  templateUrl: './message-composer.component.html',
  styleUrl: './message-composer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageComposerComponent implements OnDestroy {
  /** Đang gửi: khóa nút gửi. */
  @Input() sending = false;
  @Input() errorKey = '';
  @Input() errorDetail = '';
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
  readonly fileLimitError = signal(false);
  readonly draggingFiles = signal(false);
  private readonly imagePreviewUrls = new Map<File, { url: string; safeUrl: SafeUrl }>();

  constructor(private readonly sanitizer: DomSanitizer) {}

  get canSend(): boolean {
    return (
      !this.sending && (this.form.controls.content.value.trim().length > 0 || this.files().length > 0)
    );
  }

  ngOnDestroy(): void {
    this.revokePreviewUrls(this.files());
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
  }

  removeFiles(files: File[]): void {
    const saved = new Set(files);
    this.revokePreviewUrls(files);
    this.files.update((current) => current.filter((file) => !saved.has(file)));
    this.fileLimitError.set(false);
  }

  clearTextAfterPartialSend(): void {
    this.form.controls.content.reset();
    this.replyCancelled.emit();
  }

  clearAfterSend(): void {
    this.replyCancelled.emit();
    this.form.reset();
    this.revokePreviewUrls(this.files());
    this.files.set([]);
    this.fileError.set(false);
    this.fileLimitError.set(false);
    this.emojiOpen.set(false);
    this.draggingFiles.set(false);
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
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.sending && event.dataTransfer?.types.includes('Files')) {
      this.draggingFiles.set(true);
    }
  }

  onDragLeave(event: DragEvent): void {
    const currentTarget = event.currentTarget;
    if (currentTarget instanceof HTMLElement &&
        event.relatedTarget instanceof Node &&
        currentTarget.contains(event.relatedTarget)) {
      return;
    }
    this.draggingFiles.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.draggingFiles.set(false);
    if (!this.sending) {
      this.addFiles(Array.from(event.dataTransfer?.files ?? []));
    }
  }

  onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length) {
      event.preventDefault();
      this.addFiles(files);
    }
  }

  isImage(file: File): boolean {
    return file.type.startsWith('image/');
  }

  previewUrl(file: File): SafeUrl | string {
    if (!this.isImage(file)) {
      return '';
    }
    let preview = this.imagePreviewUrls.get(file);
    if (!preview) {
      const url = URL.createObjectURL(file);
      preview = { url, safeUrl: this.sanitizer.bypassSecurityTrustUrl(url) };
      this.imagePreviewUrls.set(file, preview);
    }
    return preview.safeUrl;
  }

  removeFile(index: number): void {
    const current = this.files();
    const removed = current[index];
    if (removed) {
      this.revokePreviewUrls([removed]);
      this.files.set(current.filter((_, i) => i !== index));
      this.fileLimitError.set(false);
    }
  }

  sizeLabel(bytes: number): string {
    return formatFileSize(bytes);
  }

  private addFiles(picked: File[]): void {
    const valid = picked.filter((file) => file.size <= MAX_FILE_BYTES);
    const remaining = Math.max(0, MAX_FILES - this.files().length);
    this.fileError.set(valid.length !== picked.length);
    this.fileLimitError.set(valid.length > remaining);
    this.files.update((current) => [...current, ...valid.slice(0, remaining)]);
  }

  private revokePreviewUrls(files: File[]): void {
    for (const file of files) {
      const preview = this.imagePreviewUrls.get(file);
      if (preview) {
        URL.revokeObjectURL(preview.url);
        this.imagePreviewUrls.delete(file);
      }
    }
  }
}
