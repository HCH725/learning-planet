/**
 * Parent area and 4-digit PIN gate.
 *
 * This is child-resistance on one device, not authentication and not an OS
 * kiosk: a determined adult can clear site data. The UI says so explicitly.
 */
import { el } from './dom';
import { createScope, type Disposable } from './lifecycle';
import { getSettingsStore, hashPin, isPinFormat, verifyPin, type Settings } from './settings';

const LOCKOUT_MS = 600;

type PinFormOptions = {
  mode: 'set' | 'unlock';
  heading: string;
  note?: string;
  onSuccess(): void;
  onCancel?(): void;
};

function pinField(labelText: string, id: string): { wrapper: HTMLElement; input: HTMLInputElement } {
  const input = el('input', {
    class: 'pin-input',
    attrs: {
      id,
      type: 'password',
      inputmode: 'numeric',
      pattern: '[0-9]*',
      maxlength: 4,
      autocomplete: 'off',
      'aria-describedby': `${id}-hint`,
    },
  }) as HTMLInputElement;
  const wrapper = el(
    'label',
    { class: 'pin-field', attrs: { for: id } },
    el('span', { class: 'pin-field__label', text: labelText }),
    input,
  );
  return { wrapper, input };
}

export function createPinForm(options: PinFormOptions): { root: HTMLElement; dispose(): void } {
  const store = getSettingsStore();
  const scope = createScope('pin-form');
  const first = pinField(options.mode === 'set' ? '設定 4 位數 PIN' : '輸入 4 位數 PIN', 'pin-primary');
  const second = options.mode === 'set' ? pinField('再輸入一次', 'pin-confirm') : null;

  const message = el('p', { class: 'pin-message', attrs: { role: 'status', 'aria-live': 'polite' } });
  const submit = el('button', {
    class: 'pin-submit',
    text: options.mode === 'set' ? '儲存 PIN' : '確認',
    attrs: { type: 'submit' },
  }) as HTMLButtonElement;

  const form = el('form', { class: 'pin-form', attrs: { novalidate: 'novalidate' } }) as HTMLFormElement;
  form.append(el('h2', { text: options.heading }));

  if (options.mode === 'set') {
    form.append(
      el('p', { class: 'pin-note', text: '第一次設定家長 PIN。忘記時只能清除本站資料重設。' }),
      first.wrapper,
      second!.wrapper,
      message,
      el('div', { class: 'pin-actions' }, submit),
    );
  } else {
    form.append(first.wrapper, message, el('div', { class: 'pin-actions' }, submit));
    if (options.onCancel) {
      form.append(el('button', { class: 'pin-cancel', text: '取消', attrs: { type: 'button' } }));
    }
  }

  if (options.note) form.append(el('p', { class: 'pin-note', text: options.note }));

  const cancelButton = form.querySelector<HTMLButtonElement>('.pin-cancel');
  if (cancelButton) {
    scope.on(cancelButton, 'click', () => options.onCancel?.());
  }

  let busy = false;
  const setMessage = (text: string) => {
    message.textContent = text;
  };

  const onSubmit = async (event: Event) => {
    event.preventDefault();
    if (busy) return;
    const pin = first.input.value.trim();
    if (!isPinFormat(pin)) {
      setMessage('請輸入 4 位數字。');
      first.input.focus();
      return;
    }
    if (options.mode === 'set') {
      if (second!.input.value.trim() !== pin) {
        setMessage('兩次輸入不一樣，再試一次。');
        second!.input.value = '';
        second!.input.focus();
        return;
      }
      busy = true;
      const hash = await hashPin(pin);
      store.update({ parentPinHash: hash });
      busy = false;
      setMessage('已儲存。');
      options.onSuccess();
      return;
    }

    busy = true;
    submit.disabled = true;
    const ok = await verifyPin(pin, store.read().parentPinHash);
    if (ok) {
      setMessage('解鎖成功。');
      options.onSuccess();
      busy = false;
      submit.disabled = false;
      return;
    }
    setMessage('PIN 不正確，請再試一次。');
    first.input.value = '';
    scope.timeout(() => {
      submit.disabled = false;
      first.input.focus();
    }, LOCKOUT_MS);
    busy = false;
  };

  scope.on(form, 'submit', (event) => {
    void onSubmit(event);
  });

  const root = el('section', { class: 'pin-panel', attrs: { 'data-testid': 'pin-panel', 'data-mode': options.mode } }, form);
  window.setTimeout(() => first.input.focus(), 0);

  return {
    root,
    dispose() {
      scope.dispose();
    },
  };
}

/** Modal used when a child tries to leave the preschool world or open settings. */
export function requestPin(reason: string): Promise<boolean> {
  return new Promise((resolve) => {
    const scope = createScope('pin-modal');
    const overlay = el('div', {
      class: 'pin-overlay',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': reason, 'data-testid': 'pin-overlay' },
    });

    const close = (ok: boolean) => {
      scope.dispose();
      overlay.remove();
      resolve(ok);
    };

    const form = createPinForm({
      mode: 'unlock',
      heading: reason,
      note: '這個 PIN 只防止幼兒誤入，不是帳號安全機制。',
      onSuccess: () => {
        form.dispose();
        close(true);
      },
      onCancel: () => {
        form.dispose();
        close(false);
      },
    });

    scope.on(document, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') close(false);
    });

    overlay.append(form.root);
    document.body.append(overlay);
  });
}

function numberRow(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLElement {
  const input = el('input', {
    class: 'settings-range',
    attrs: { type: 'range', min, max, step, value: String(value), 'aria-label': label },
  }) as HTMLInputElement;
  const output = el('output', { class: 'settings-output', text: `${value}` });
  input.addEventListener('input', () => {
    output.textContent = input.value;
    onChange(Number(input.value));
  });
  return el('div', { class: 'settings-row' }, el('span', { class: 'settings-label', text: label }), input, output);
}

function toggleRow(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = el('input', {
    class: 'settings-checkbox',
    attrs: { type: 'checkbox', 'aria-label': label },
  }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'settings-row settings-row--check' }, input, el('span', { class: 'settings-label', text: label }));
}

function settingsPanel(store: ReturnType<typeof getSettingsStore>): { root: HTMLElement; dispose(): void } {
  const scope = createScope('settings-panel');
  const settings = store.read();
  const section = el('section', { class: 'settings-panel', attrs: { 'data-testid': 'settings-panel' } });

  const setAudio = (patch: Partial<Settings['audio']>) => {
    store.update((current) => ({ ...current, audio: { ...current.audio, ...patch } }));
  };

  section.append(
    el('h2', { text: '家長設定' }),
    el('p', { class: 'pin-note', text: '設定只存在這台裝置的瀏覽器，不會上傳。' }),
    numberRow('主音量', Math.round(settings.audio.master * 100), 0, 100, 5, (value) => setAudio({ master: value / 100 })),
    toggleRow('背景音樂', settings.audio.music, (value) => setAudio({ music: value })),
    toggleRow('音效', settings.audio.sfx, (value) => setAudio({ sfx: value })),
    toggleRow('語音提示', settings.audio.voice, (value) => setAudio({ voice: value })),
    toggleRow('減少動態效果', settings.reducedMotion, (value) => store.update({ reducedMotion: value })),
    numberRow('休息提醒（分鐘，0＝關閉）', settings.breakMinutes, 0, 60, 5, (value) => store.update({ breakMinutes: value })),
  );

  const mute = el('button', {
    class: 'settings-action',
    text: settings.audio.master === 0 ? '取消靜音' : '全部靜音',
    attrs: { type: 'button', 'data-testid': 'mute-toggle', 'aria-pressed': String(settings.audio.master === 0) },
  });
  scope.on(mute, 'click', () => {
    const current = store.read();
    const nextMaster = current.audio.master === 0 ? 0.65 : 0;
    store.update((value) => ({ ...value, audio: { ...value.audio, master: nextMaster } }));
    mute.textContent = nextMaster === 0 ? '取消靜音' : '全部靜音';
    mute.setAttribute('aria-pressed', String(nextMaster === 0));
  });

  const reset = el('button', { class: 'settings-action settings-action--danger', text: '重設所有設定', attrs: { type: 'button' } });
  let armed = false;
  scope.on(reset, 'click', () => {
    if (!armed) {
      armed = true;
      reset.textContent = '再按一次確認重設';
      scope.timeout(() => {
        armed = false;
        reset.textContent = '重設所有設定';
      }, 4000);
      return;
    }
    store.reset();
    window.location.reload();
  });

  section.append(
    el('div', { class: 'settings-actions' }, mute, reset),
    el('h3', { text: '離開幼兒樂園' }),
    el('p', {
      class: 'pin-note',
      text: '網站無法鎖住整台裝置。iPhone／iPad 可用「引導使用模式」，Android 可用「螢幕固定」，把孩子留在單一 App。',
    }),
    el('a', { class: 'back-link', text: '← 回星球', attrs: { href: '/' } }),
  );

  return { root: section, dispose: () => scope.dispose() };
}

export function renderParent(host: HTMLElement): Disposable {
  const scope = createScope('parent');
  const store = getSettingsStore();
  const body = el('div', { class: 'parent-body' });
  host.append(
    el(
      'header',
      { class: 'preschool-header' },
      el('a', { class: 'back-link', text: '← 回星球', attrs: { href: '/' } }),
      el('h1', { class: 'preschool-title', text: '家長區' }),
    ),
    body,
  );

  let panel: { root: HTMLElement; dispose(): void } | null = null;

  const showSettings = () => {
    panel?.dispose();
    panel = settingsPanel(store);
    body.replaceChildren(panel.root);
  };

  const showGate = () => {
    panel?.dispose();
    const hasPin = Boolean(store.read().parentPinHash);
    const form = createPinForm({
      mode: hasPin ? 'unlock' : 'set',
      heading: hasPin ? '請輸入家長 PIN' : '建立家長 PIN',
      onSuccess: showSettings,
    });
    panel = form;
    body.replaceChildren(form.root);
  };

  showGate();

  return {
    dispose() {
      panel?.dispose();
      scope.dispose();
    },
  };
}
