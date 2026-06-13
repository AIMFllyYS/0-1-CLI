export type DesktopActionKind = 'native-install' | 'native-skills' | 'cli-command';

export interface DesktopAction {
  id: 'clear' | 'skills' | 'install' | 'state' | 'api' | 'pay';
  kind: DesktopActionKind;
  title: string;
  command: string;
  description: string;
}

export const desktopActions: DesktopAction[] = [
  { id: 'clear', kind: 'cli-command', title: 'Clean workstation', command: 'hi --clear', description: 'Scan first, then clean only after CLI confirmation.' },
  { id: 'skills', kind: 'native-skills', title: 'Skills market', command: 'hi --skills', description: 'Browse skill packages, choose targets, and confirm installation.' },
  { id: 'install', kind: 'native-install', title: 'Install tools', command: 'hi --install', description: 'Use desktop categories, target cards, and explicit install confirmation.' },
  { id: 'state', kind: 'cli-command', title: 'System state', command: 'hi --state', description: 'Show GitHub, project paths, commands, and app status.' },
  { id: 'api', kind: 'cli-command', title: 'API platforms', command: 'hi --api', description: 'Open model API platform guidance.' },
  { id: 'pay', kind: 'cli-command', title: 'Payment resources', command: 'hi --pay', description: 'Open payment and account resource guidance.' },
];
