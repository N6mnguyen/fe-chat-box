import { Injectable } from '@angular/core';
import { NzMessageRef, NzMessageService } from 'ng-zorro-antd/message';
import { ModalOptions, NzModalRef, NzModalService } from 'ng-zorro-antd/modal';

const NOTICE_OPTIONS = {
  nzAnimate: true,
  nzPauseOnHover: true,
};

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  constructor(
    private readonly messages: NzMessageService,
    private readonly modals: NzModalService,
  ) {}

  success(message: string): NzMessageRef {
    return this.show('success', message, 4000);
  }

  error(message: string): NzMessageRef {
    return this.show('error', message, 6000);
  }

  warning(message: string): NzMessageRef {
    return this.show('warning', message, 5000);
  }

  info(message: string): NzMessageRef {
    return this.show('info', message, 4000);
  }

  confirm<T>(options: ModalOptions<T> = {}): NzModalRef<T> {
    const classes = [
      'app-modal',
      'app-modal--confirm',
      options.nzOkDanger ? 'app-modal--confirm-danger' : '',
      options.nzWrapClassName,
    ].filter(Boolean).join(' ');

    return this.modals.confirm({
      ...options,
      nzCentered: options.nzCentered ?? true,
      nzWidth: options.nzWidth ?? 420,
      nzMaskClosable: options.nzMaskClosable ?? true,
      nzKeyboard: options.nzKeyboard ?? true,
      nzAutofocus: options.nzAutofocus ?? 'cancel',
      nzIconType: options.nzIconType ?? (options.nzOkDanger ? 'exclamation-circle' : 'question-circle'),
      nzWrapClassName: classes,
    });
  }

  private show(type: 'success' | 'error' | 'warning' | 'info', content: string, duration: number): NzMessageRef {
    return this.messages.create(type, content, {
      ...NOTICE_OPTIONS,
      nzDuration: duration,
      nzClass: `app-notice app-notice--${type}`,
    });
  }
}
