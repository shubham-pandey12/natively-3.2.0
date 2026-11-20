import { setTimeout as delay } from 'node:timers/promises';

export const endpoint = (port) => `http://127.0.0.1:${port}`;

export async function waitFor(check, signal, timeout = 15_000, interval = 100) {
  const deadline = Date.now() + timeout;
  do {
    signal.throwIfAborted();
    const value = await check();
    if (value) return value;
    await delay(interval, undefined, { signal });
  } while (Date.now() < deadline);
  return undefined;
}

export async function discover(port, signal) {
  try {
    const response = await fetch(`${endpoint(port)}/json/version`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(500)]),
    });
    if (response.ok) return await response.json();
  } catch {
    signal.throwIfAborted();
  }
  return undefined;
}

class Connection {
  constructor(socket, signal) {
    this.socket = socket;
    this.signal = signal;
    this.sequence = 0;
    this.pending = new Map();
    this.onEvent = () => {};
    socket.addEventListener('message', ({ data }) => {
      const { id, method, params, sessionId, result, error } = JSON.parse(data);
      if (!id) {
        this.onEvent(method, params, sessionId);
        return;
      }
      const request = this.pending.get(id);
      if (error) request?.reject(new Error(`${request.method}: ${error.message}`));
      else request?.resolve(result);
    });
    socket.addEventListener('close', () => {
      for (const request of this.pending.values()) request.reject(new Error('CDP disconnected'));
    });
  }

  send(method, params = {}, sessionId) {
    this.signal.throwIfAborted();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const finish = (callback) => (value) => {
        clearTimeout(timer);
        this.pending.delete(id);
        this.signal.removeEventListener('abort', onAbort);
        callback(value);
      };
      const request = { method, resolve: finish(resolve), reject: finish(reject) };
      const onAbort = () => request.reject(this.signal.reason);
      const timer = setTimeout(() => request.reject(new Error(`${method} timed out`)), 12_000);
      this.pending.set(id, request);
      this.signal.addEventListener('abort', onAbort, { once: true });
      try {
        this.socket.send(JSON.stringify({ id, method, params, sessionId }));
      } catch (error) {
        request.reject(error);
      }
    });
  }
}

function describe(remote) {
  return remote.description ?? remote.value ?? remote.unserializableValue ?? remote.type;
}

function networkUrl(value) {
  // Keep origin/path only. Query strings, fragments and URL credentials may contain tokens.
  try {
    const url = new URL(value);
    if (!['file:', 'http:', 'https:'].includes(url.protocol)) return url.protocol;
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '<invalid URL>';
  }
}

class Page {
  constructor(connection, session, info) {
    this.connection = connection;
    this.session = session;
    this.info = info;
    this.console = [];
    this.network = [];
  }

  send(method, params) {
    return this.connection.send(method, params, this.session);
  }

  async evaluate(fn, ...args) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression: `(${fn})(...${JSON.stringify(args)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  }

  async screenshot() {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  }

  event(method, event) {
    if (method === 'Runtime.consoleAPICalled') {
      this.console.push({
        type: event.type,
        message: event.args.map(describe).join(' '),
        stack: event.stackTrace?.callFrames,
        timestamp: event.timestamp,
      });
    } else if (method === 'Runtime.exceptionThrown') {
      const { exceptionDetails: details } = event;
      this.console.push({
        type: 'exception',
        message: details.exception?.description ?? details.text,
        stack: details.stackTrace?.callFrames,
        timestamp: event.timestamp,
      });
    } else if (method === 'Log.entryAdded' && event.entry.source !== 'javascript') {
      const { level, text, source, url, timestamp } = event.entry;
      this.console.push({ type: level, message: text, source, url, timestamp });
    } else if (method === 'Network.requestWillBeSent') {
      this.network.push({
        type: 'request', id: event.requestId, method: event.request.method,
        url: networkUrl(event.request.url), timestamp: event.timestamp,
      });
    } else if (method === 'Network.responseReceived') {
      this.network.push({
        type: 'response', id: event.requestId, status: event.response.status,
        url: networkUrl(event.response.url), timestamp: event.timestamp,
      });
    } else if (method === 'Network.loadingFailed') {
      this.network.push({
        type: 'failure', id: event.requestId, message: event.errorText, timestamp: event.timestamp,
      });
    }
  }
}

export async function connectBrowser(url, signal, expectedPid) {
  const socket = new WebSocket(url);
  const connection = new Connection(socket, signal);
  const pages = new Map();
  const issues = [];
  try {
    const opening = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
    await new Promise((resolve, reject) => {
      opening.throwIfAborted();
      const fail = () => reject(new Error('Could not open CDP WebSocket'));
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', fail, { once: true });
      opening.addEventListener('abort', fail, { once: true });
    });
    const processInfo = () => connection.send('SystemInfo.getProcessInfo');
    const { processInfo: processes } = await processInfo();
    if (processes.find(({ type }) => type === 'browser')?.id !== expectedPid) {
      throw new Error('CDP browser PID does not match the launched process');
    }
    connection.onEvent = (method, params, sessionId) => {
      if (method === 'Target.attachedToTarget') {
        const { targetInfo, sessionId: session, waitingForDebugger } = params;
        const page = new Page(connection, session, targetInfo);
        if (targetInfo.type === 'page') pages.set(session, page);
        (async () => {
          try {
            if (targetInfo.type === 'page') {
              await Promise.all(['Runtime.enable', 'Network.enable', 'Log.enable', 'Page.enable']
                .map((domain) => page.send(domain)));
              page.enabled = true;
            }
          } finally {
            if (waitingForDebugger) await page.send('Runtime.runIfWaitingForDebugger');
          }
        })().catch((error) => issues.push(error.message));
      } else if (method === 'Target.targetInfoChanged') {
        for (const page of pages.values()) {
          if (page.info.targetId === params.targetInfo.targetId) page.info = params.targetInfo;
        }
      } else if (method === 'Target.detachedFromTarget') {
        const page = pages.get(params.sessionId);
        if (page) page.detached = true;
      } else {
        pages.get(sessionId)?.event(method, params);
      }
    };
    await connection.send('Target.setDiscoverTargets', { discover: true });
    await connection.send('Target.setAutoAttach', {
      autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
      filter: [{ type: 'page' }, { exclude: true }],
    });
    return {
      pages, issues,
      processInfo,
      close: () => socket.close(),
    };
  } catch (error) {
    socket.close();
    throw error;
  }
}

export function pageWindow(page) {
  try {
    return new URL(page.info.url).searchParams.get('window');
  } catch {
    return null;
  }
}
