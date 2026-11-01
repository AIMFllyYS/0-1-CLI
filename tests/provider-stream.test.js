const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

const ENV_KEYS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_MODELS', 'DEEPSEEK_API_KEY', 'ZHIPU_API_KEY'];

function sse(...events) {
  return events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('');
}

function delta(value) {
  return { choices: [{ delta: value }] };
}

// Starts a one-route SSE server; `handler` writes the response and may inspect the request body.
async function withServer(handler, run) {
  const bodies = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      bodies.push({ body, headers: req.headers, url: req.url });
      handler(req, res, body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  ENV_KEYS.forEach((key) => delete process.env[key]);
  process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';
  try {
    await run({ bodies, port });
  } finally {
    ENV_KEYS.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function model() {
  const { resolveModelInfo } = require('../dist/chat/models');
  return resolveModelInfo('test-model');
}

test('chatStreamMessage streams tokens and returns the full assistant message', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sse(delta({ content: 'Hel' }), delta({ content: 'lo ' }), delta({ content: '世界' }), '[DONE]'));
  }, async ({ bodies }) => {
    const tokens = [];
    const message = await chatStreamMessage([{ role: 'user', content: 'hi' }], model(), undefined, {
      onToken: (token) => tokens.push(token),
    });

    assert.deepEqual(tokens, ['Hel', 'lo ', '世界']);
    assert.equal(message.role, 'assistant');
    assert.equal(message.content, 'Hello 世界');
    assert.equal(message.tool_calls, undefined);
    assert.equal(bodies[0].body.stream, true);
    assert.equal(bodies[0].url, '/v1/chat/completions');
    assert.equal(bodies[0].headers.authorization, 'Bearer test-key');
  });
});

test('chatStreamMessage assembles tool calls from fragmented deltas', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sse(
      delta({ content: 'Let me look. ' }),
      delta({ tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'read_file', arguments: '' } }] }),
      delta({ tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] }),
      delta({ tool_calls: [{ index: 1, id: 'call_b', type: 'function', function: { name: 'list_files', arguments: '{"path":"."}' } }] }),
      delta({ tool_calls: [{ index: 0, function: { arguments: '"README.md"}' } }] }),
      '[DONE]',
    ));
  }, async () => {
    const tokens = [];
    const message = await chatStreamMessage([{ role: 'user', content: 'x' }], model(), [{ type: 'function', function: { name: 'read_file' } }], {
      onToken: (token) => tokens.push(token),
    });

    assert.equal(message.content, 'Let me look. ');
    assert.deepEqual(tokens, ['Let me look. ']);
    assert.equal(message.tool_calls.length, 2);
    assert.deepEqual(message.tool_calls[0], {
      id: 'call_a',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"README.md"}' },
    });
    assert.equal(message.tool_calls[1].id, 'call_b');
    assert.equal(JSON.parse(message.tool_calls[1].function.arguments).path, '.');
  });
});

test('chatStreamMessage sends tool specs and generates ids for tool calls that lack one', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sse(delta({ tool_calls: [{ index: 0, function: { name: 'shell', arguments: '{}' } }] }), '[DONE]'));
  }, async ({ bodies }) => {
    const tools = [{ type: 'function', function: { name: 'shell' } }];
    const message = await chatStreamMessage([{ role: 'user', content: 'x' }], model(), tools);

    assert.deepEqual(bodies[0].body.tools, tools);
    assert.match(message.tool_calls[0].id, /^call_/);
    assert.equal(message.tool_calls[0].function.name, 'shell');
    assert.equal(message.content, '');
  });
});

test('chatStreamMessage forwards reasoning tokens separately from content', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sse(delta({ reasoning_content: 'thinking...' }), delta({ content: 'answer' }), '[DONE]'));
  }, async () => {
    const reasoning = [];
    const tokens = [];
    const message = await chatStreamMessage([{ role: 'user', content: 'x' }], model(), undefined, {
      onToken: (token) => tokens.push(token),
      onReasoning: (token) => reasoning.push(token),
    });

    assert.deepEqual(reasoning, ['thinking...']);
    assert.deepEqual(tokens, ['answer']);
    assert.equal(message.content, 'answer');
  });
});

test('chatStreamMessage survives events split across network chunks and CRLF line endings', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');
  const payload = sse(delta({ content: '你好' }), delta({ content: '，世界' }), '[DONE]').replace(/\n/g, '\r\n');
  const bytes = Buffer.from(payload, 'utf8');

  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    // Slice mid-event and mid multibyte character.
    let offset = 0;
    const timer = setInterval(() => {
      if (offset >= bytes.length) {
        clearInterval(timer);
        res.end();
        return;
      }
      res.write(bytes.subarray(offset, offset + 7));
      offset += 7;
    }, 2);
  }, async () => {
    const message = await chatStreamMessage([{ role: 'user', content: 'x' }], model());
    assert.equal(message.content, '你好，世界');
  });
});

test('chatStreamMessage resolves with what arrived when the stream ends without [DONE]', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sse(delta({ content: 'partial' })));
  }, async () => {
    const message = await chatStreamMessage([{ role: 'user', content: 'x' }], model());
    assert.equal(message.content, 'partial');
  });
});

test('chatStreamMessage rejects with a clear message on 401 and on API errors', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');

  await withServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'bad key' } }));
  }, async () => {
    await assert.rejects(chatStreamMessage([{ role: 'user', content: 'x' }], model()), /API Key 无效或已过期/);
  });

  await withServer((req, res) => {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'rate limited' } }));
  }, async () => {
    await assert.rejects(chatStreamMessage([{ role: 'user', content: 'x' }], model()), /rate limited/);
  });

  await withServer((req, res) => {
    res.writeHead(502);
    res.end('<html>bad gateway</html>');
  }, async () => {
    await assert.rejects(chatStreamMessage([{ role: 'user', content: 'x' }], model()), /API 错误 502/);
  });
});

test('chatStreamMessage rejects when no api key is configured', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');
  await withServer((req, res) => res.end(), async () => {
    process.env.AI_API_KEY = '';
    await assert.rejects(chatStreamMessage([{ role: 'user', content: 'x' }], model()), /未配置/);
  });
});

test('chatStreamMessage aborts mid-stream with an AbortError and closes the connection', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');
  let serverSawClose;
  const closed = new Promise((resolve) => { serverSawClose = resolve; });

  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(sse(delta({ content: 'first' })));
    res.on('close', serverSawClose);
    // never ends on its own
  }, async () => {
    const controller = new AbortController();
    const tokens = [];
    const pending = chatStreamMessage([{ role: 'user', content: 'x' }], model(), undefined, {
      signal: controller.signal,
      onToken: (token) => {
        tokens.push(token);
        controller.abort();
      },
    });

    await assert.rejects(pending, (error) => error.name === 'AbortError');
    assert.deepEqual(tokens, ['first']);
    await Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('server connection stayed open after abort')), 3000)),
    ]);
  });
});

test('chatStreamMessage rejects immediately when the signal is already aborted', async () => {
  const { chatStreamMessage } = require('../dist/chat/provider');
  await withServer((req, res) => res.end(), async ({ bodies }) => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      chatStreamMessage([{ role: 'user', content: 'x' }], model(), undefined, { signal: controller.signal }),
      (error) => error.name === 'AbortError',
    );
    assert.equal(bodies.length, 0);
  });
});

test('the existing non-streaming and streamChat entry points are unchanged', () => {
  const provider = require('../dist/chat/provider');
  assert.equal(typeof provider.streamChat, 'function');
  assert.equal(typeof provider.chatCompleteMessage, 'function');
  assert.equal(typeof provider.chatStreamMessage, 'function');
});
