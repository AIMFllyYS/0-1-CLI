const ALLOWED_COMMANDS = new Set([
  'state',
  'api',
  'pay',
  'help',
]);

export function isAllowedDesktopCommand(command: string): boolean {
  return ALLOWED_COMMANDS.has(command.split(/\s+/)[0] || '');
}

export function normalizeDesktopCommand(command: string): string {
  return command.trim().replace(/^hi\s+/, '').replace(/^--/, '').toLowerCase();
}
