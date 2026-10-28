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

import { AvatarComponent } from '../../shared/avatar.component';
import { IconComponent } from '../../shared/icon.component';
import { Conversation } from '../chat.models';

@Component({
  selector: 'app-chat-header',
  standalone: true,
  imports: [ReactiveFormsModule, TranslocoPipe, AvatarComponent, IconComponent],
  templateUrl: './chat-header.component.html',
  styleUrl: './chat-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatHeaderComponent {
  @Input({ required: true })
  set conversation(value: Conversation) {
    this.current = value;
    // Tính sẵn dòng tên thành viên để template không gọi hàm.
    this.memberLine = value.memberNames.join(', ');
  }
  get conversation(): Conversation {
    return this.current;
  }
  @Input() typing = false;
  @Input() infoOpen = false;

  @Output() backRequested = new EventEmitter<void>();
  @Output() messageSearched = new EventEmitter<string>();
  @Output() infoToggled = new EventEmitter<void>();

  memberLine = '';
  private current!: Conversation;

  readonly searchOpen = signal(false);

  readonly searchForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
  });

  toggleSearch(): void {
    const next = !this.searchOpen();
    this.searchOpen.set(next);
    if (!next) {
      this.searchForm.reset();
      this.messageSearched.emit('');
    }
  }

  onSearchInput(): void {
    this.messageSearched.emit(this.searchForm.controls.query.value);
  }
}
