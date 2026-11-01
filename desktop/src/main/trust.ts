export function isAllowedRendererUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

// IPC is only honored from the app's own page: the packaged file, or the local dev server.
export function isTrustedSender(value: string): boolean {
  return value.startsWith('file:') || isAllowedRendererUrl(value);
}
