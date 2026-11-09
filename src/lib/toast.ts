export type ToastKind = 'success' | 'error';
export const toast = (message: string, kind: ToastKind = 'success') =>
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, kind } }));
