import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

import { UiFeedbackService } from './ui-feedback.service';

describe('UiFeedbackService', () => {
  const createMessage = vi.fn();
  const confirmModal = vi.fn();
  let feedback: UiFeedbackService;

  beforeEach(() => {
    createMessage.mockReset();
    confirmModal.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: NzMessageService, useValue: { create: createMessage } },
        { provide: NzModalService, useValue: { confirm: confirmModal } },
      ],
    });
    feedback = TestBed.inject(UiFeedbackService);
  });

  it('uses the same theme-aware notice style with severity-based duration', () => {
    feedback.success('Saved');
    feedback.error('Failed');
    feedback.warning('Check this');
    feedback.info('Information');

    expect(createMessage).toHaveBeenNthCalledWith(1, 'success', 'Saved', {
      nzAnimate: true,
      nzPauseOnHover: true,
      nzDuration: 4000,
      nzClass: 'app-notice app-notice--success',
    });
    expect(createMessage).toHaveBeenNthCalledWith(2, 'error', 'Failed', {
      nzAnimate: true,
      nzPauseOnHover: true,
      nzDuration: 6000,
      nzClass: 'app-notice app-notice--error',
    });
    expect(createMessage).toHaveBeenNthCalledWith(3, 'warning', 'Check this', {
      nzAnimate: true,
      nzPauseOnHover: true,
      nzDuration: 5000,
      nzClass: 'app-notice app-notice--warning',
    });
    expect(createMessage).toHaveBeenNthCalledWith(4, 'info', 'Information', {
      nzAnimate: true,
      nzPauseOnHover: true,
      nzDuration: 4000,
      nzClass: 'app-notice app-notice--info',
    });
  });

  it('applies shared centered confirmation defaults while preserving custom options', () => {
    const onOk = vi.fn();
    feedback.confirm({
      nzTitle: 'Remove friend?',
      nzWrapClassName: 'feature-modal',
      nzOkDanger: true,
      nzOnOk: onOk,
    });

    expect(confirmModal).toHaveBeenCalledWith(expect.objectContaining({
      nzCentered: true,
      nzWidth: 420,
      nzMaskClosable: true,
      nzKeyboard: true,
      nzAutofocus: 'cancel',
      nzIconType: 'exclamation-circle',
      nzWrapClassName: 'app-modal app-modal--confirm app-modal--confirm-danger feature-modal',
      nzOnOk: onOk,
    }));

    feedback.confirm({ nzTitle: 'Continue?' });
    expect(confirmModal).toHaveBeenLastCalledWith(expect.objectContaining({
      nzIconType: 'question-circle',
      nzWrapClassName: 'app-modal app-modal--confirm',
    }));
  });
});
