// The preload script runs in a sandbox and cannot import local modules, so it carries its own copy of this
// list. tests/desktop-bridge.test.js keeps the copies identical to src/desktop/api.ts.
export const REQUEST_CHANNELS = [
  'app:getState',
  'settings:set',
  'settings:reset',
  'provider:save',
  'workspace:choose',
  'workspace:set',
  'github:summary',
  'launch:list',
  'launch:run',
  'ai:createSession',
  'ai:send',
  'ai:approve',
  'ai:abort',
  'ai:setMode',
  'ai:reset',
  'ai:close',
] as const;

export const EVENT_CHANNELS = ['ai:event'] as const;

export type RequestChannel = (typeof REQUEST_CHANNELS)[number];
