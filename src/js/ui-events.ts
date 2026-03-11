export const UI_SYNC_EVENT = "paint:ui-sync";
export const UI_ERROR_EVENT = "paint:ui-error";

export function requestUiSync(): void {
  window.dispatchEvent(new Event(UI_SYNC_EVENT));
}

export function publishUiError(message: string): void {
  window.dispatchEvent(new CustomEvent<string>(UI_ERROR_EVENT, { detail: message }));
}
