const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (file) => fs.readFileSync(path.join(...file.split('/')), 'utf8');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

const RENDERER = 'desktop/src/renderer';
const sources = () => walk(RENDERER).filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes(`${path.sep}dev${path.sep}`));
const styles = () => walk(path.join(RENDERER, 'styles')).filter((file) => file.endsWith('.css'));

test('the renderer never reaches Electron, Node or the file system directly', () => {
  for (const file of sources()) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from 'electron'|require\('electron'\)|child_process|from 'fs'|from 'node:|require\('fs'\)|ipcRenderer/, file);
    assert.doesNotMatch(source, /\beval\(|new Function\(|dangerouslySetInnerHTML|innerHTML\s*=/, file);
  }
});

test('only the store talks to the bridge, and main.tsx only hands it over', () => {
  const allowed = (file) => file.endsWith(path.join('state', 'store.ts')) || file.endsWith('main.tsx');
  for (const file of sources().filter((item) => !allowed(item))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /zeroOneCli/, file + ' must go through the store');
  }
  assert.match(read('desktop/src/renderer/main.tsx'), /window as unknown as \{ zeroOneCli/);
});

test('the browser preview mock is development-only and never imported statically', () => {
  const main = read('desktop/src/renderer/main.tsx');
  assert.match(main, /import\.meta\.env\.DEV/);
  assert.match(main, /await import\('\.\/dev\/mock-bridge'\)/);
  for (const file of sources().filter((item) => !item.endsWith('main.tsx'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /mock-bridge/, file);
  }
});

test('markdown from the model is rendered as data: no raw html, links open outside the app', () => {
  const markdown = read('desktop/src/renderer/components/Markdown.tsx');
  assert.doesNotMatch(markdown, /rehype-raw|allowDangerousHtml|dangerouslySetInnerHTML/);
  assert.match(markdown, /rel="noreferrer noopener"/);
  assert.match(markdown, /target="_blank"/);
});

test('every colour comes from a design token, in both themes', () => {
  const tokens = read('desktop/src/renderer/styles/tokens.css');
  const lightStart = tokens.indexOf(':root[data-theme="light"]');
  const darkStart = tokens.indexOf(':root[data-theme="dark"]');
  assert.ok(lightStart > 0 && darkStart > lightStart, 'both theme blocks exist');
  const names = (css) => new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  const lightNames = names(tokens.slice(lightStart, darkStart));
  const darkNames = names(tokens.slice(darkStart));
  assert.ok(lightNames.size >= 25, "the theme defines a full token set");
  assert.deepEqual([...lightNames].filter((name) => !darkNames.has(name)), [], 'every light token needs a dark value');
  assert.deepEqual([...darkNames].filter((name) => !lightNames.has(name)), [], 'every dark token needs a light value');

  const all = names(tokens);
  for (const file of styles().filter((item) => !item.endsWith('tokens.css'))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/var\((--[a-z0-9-]+)/g)) {
      assert.ok(all.has(match[1]), file + ' uses undefined token ' + match[1]);
    }
  }
});

test('colour is not hardcoded in component styles apart from white on solid fills', () => {
  for (const file of styles().filter((item) => !item.endsWith('tokens.css'))) {
    const css = fs.readFileSync(file, 'utf8');
    const literals = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0].toLowerCase()).filter((value) => value !== '#fff' && value !== '#ffffff');
    assert.deepEqual(literals, [], `${file} should use tokens`);
  }
});

test('interactive text and surfaces keep readable contrast in both themes', () => {
  const tokens = read('desktop/src/renderer/styles/tokens.css');
  const luminance = (hex) => {
    const value = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const themeBlock = (selector) => {
    const start = tokens.indexOf(selector);
    return tokens.slice(start, tokens.indexOf('}', start));
  };
  const value = (block, name) => block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))[1];

  for (const [label, block] of [['light', themeBlock(':root[data-theme="light"]')], ['dark', themeBlock(':root[data-theme="dark"]')]]) {
    const bg = value(block, '--bg');
    const surface = value(block, '--surface');
    assert.ok(ratio(value(block, '--text'), bg) >= 7, `${label}: body text on page`);
    assert.ok(ratio(value(block, '--text'), surface) >= 7, `${label}: body text on surface`);
    assert.ok(ratio(value(block, '--text-2'), bg) >= 4.5, `${label}: secondary text`);
    assert.ok(ratio(value(block, '--text-3'), bg) >= 3, `${label}: hint text (large/ancillary)`);
    assert.ok(ratio(value(block, '--on-accent'), value(block, '--accent')) >= 3, `${label}: text on the accent button`);
    assert.ok(ratio(value(block, '--accent'), bg) >= 3, `${label}: accent against page for focus rings and links`);
    for (const name of ['--danger', '--success', '--warning']) {
      assert.ok(ratio(value(block, name), surface) >= 3, `${label}: ${name} on surface`);
    }
  }
});

test('motion respects the reduced-motion preference and focus is always visible', () => {
  const base = read('desktop/src/renderer/styles/base.css');
  assert.match(base, /prefers-reduced-motion: reduce/);
  assert.match(base, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  assert.doesNotMatch(base, /outline:\s*none[^;]*;\s*\}\s*\n\s*:focus-visible/);
});

test('the conversation is a live region and the approval card announces itself', () => {
  const chat = read('desktop/src/renderer/components/ChatPage.tsx');
  const approval = read('desktop/src/renderer/components/ApprovalCard.tsx');
  assert.match(chat, /role="log"/);
  assert.match(chat, /aria-live="polite"/);
  assert.match(approval, /aria-live="polite"/);
  assert.match(approval, /focus\(/, 'the card moves focus to its safest action');
});

test('dangerous or destructive actions are never one click', () => {
  const settings = read('desktop/src/renderer/components/SettingsPage.tsx');
  const tools = read('desktop/src/renderer/components/ToolsPage.tsx');
  assert.match(settings, /role="alertdialog"/);
  assert.match(settings, /setConfirmAuto\(true\)/);
  assert.match(tools, /function ConfirmButton/);
  assert.equal((tools.match(/<ConfirmButton/g) || []).length, 3, 'install, skills and clean all confirm');
  // The action handlers are only reachable from ConfirmButton's onConfirm, never from a plain button.
  assert.doesNotMatch(tools, /<button[^>]*onClick=\{\(\) => void (install|end)\(/);
});

test('the composer ignores Enter while an input method is composing', () => {
  const composer = read('desktop/src/renderer/components/Composer.tsx');
  assert.match(composer, /isComposing/);
  assert.match(composer, /onCompositionStart/);
  assert.match(composer, /onCompositionEnd/);
});

test('shortcuts documented in the design are actually bound', () => {
  const app = read('desktop/src/renderer/App.tsx');
  const composer = read('desktop/src/renderer/components/Composer.tsx');
  assert.match(app, /key\.toLowerCase\(\) === 'n'/);
  assert.match(app, /key === ','/);
  assert.match(app, /key\.toLowerCase\(\) === 'l'/);
  assert.match(composer, /event\.key === 'Tab' && event\.shiftKey/);
  assert.match(composer, /event\.key === 'Escape' && running/);
});

test('the old dark-only layout and its files are gone', () => {
  for (const gone of ['desktop/src/renderer/codex-shell', 'desktop/src/renderer/styles.css', 'desktop/src/renderer/action-catalog.ts']) {
    assert.equal(fs.existsSync(gone), false, `${gone} should be deleted`);
  }
  assert.match(read('desktop/index.html'), /renderer\/main\.tsx/);
});

test('the production page has a strict content security policy', () => {
  const html = read('desktop/index.html');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'self'/);
  assert.doesNotMatch(html, /unsafe-eval/);
});
