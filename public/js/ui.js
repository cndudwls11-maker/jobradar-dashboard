export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function display(value) { return value === null || value === undefined || value === '' ? '미확인' : escapeHtml(value); }

export function toast(message, type = '') {
  const region = $('#toast-region');
  const item = document.createElement('div');
  item.className = `toast ${type}`.trim();
  item.textContent = message;
  region.append(item);
  window.setTimeout(() => item.remove(), 6000);
}

export function confirmDialog(title, message, confirmText = '삭제 확인') {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-accept').textContent = confirmText;
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

export function formatDate(value, withTime = false) {
  if (!value) return 'X';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'X';
  return new Intl.DateTimeFormat('ko-KR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(date);
}

export function deadlineLabel(value) {
  if (!value) return { label: '미확인', className: '' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return { label: 'X', className: '' };
  const left = Math.ceil((target - today) / 86400000);
  if (left < 0) return { label: '마감', className: 'deadline-expired' };
  if (left <= 3) return { label: left === 0 ? '오늘 마감' : `D-${left}`, className: 'deadline-soon' };
  return { label: value, className: '' };
}