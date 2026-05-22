import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, it, expect } from 'bun:test';

// ─── BrowserManager basic unit tests ─────────────────────────────

describe('BrowserManager defaults', () => {
  it('getConnectionMode defaults to launched', async () => {
    const { BrowserManager } = await import('../src/browser-manager');
    const bm = new BrowserManager();
    expect(bm.getConnectionMode()).toBe('launched');
  });

  it('getRefMap returns empty array initially', async () => {
    const { BrowserManager } = await import('../src/browser-manager');
    const bm = new BrowserManager();
    expect(bm.getRefMap()).toEqual([]);
  });
});

// ─── shouldEnableChromiumSandbox ─────────────────────────────────
//
// Pinning this is what prevents the "--no-sandbox" yellow infobar from
// regressing on headed launches. Playwright auto-adds --no-sandbox when
// chromiumSandbox !== true (playwright-core chromium.js:291-292), so all
// three launch sites in browser-manager.ts must pass the policy this
// helper computes.

describe('shouldEnableChromiumSandbox', () => {
  const origPlatform = process.platform;
  const origCI = process.env.CI;
  const origContainer = process.env.CONTAINER;
  const origGetuid = process.getuid;

  beforeEach(() => {
    delete process.env.CI;
    delete process.env.CONTAINER;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform });
    if (origCI === undefined) delete process.env.CI; else process.env.CI = origCI;
    if (origContainer === undefined) delete process.env.CONTAINER; else process.env.CONTAINER = origContainer;
    process.getuid = origGetuid;
  });

  function setPlatform(p: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: p });
  }

  it('darwin, no CI/CONTAINER/root → true', async () => {
    setPlatform('darwin');
    process.getuid = (() => 501) as typeof process.getuid;
    const { shouldEnableChromiumSandbox } = await import('../src/browser-manager');
    expect(shouldEnableChromiumSandbox()).toBe(true);
  });

  it('linux, no CI/CONTAINER/root → true', async () => {
    setPlatform('linux');
    process.getuid = (() => 1000) as typeof process.getuid;
    const { shouldEnableChromiumSandbox } = await import('../src/browser-manager');
    expect(shouldEnableChromiumSandbox()).toBe(true);
  });

  it('win32 → false (sandbox fails in Bun→Node→Chromium chain)', async () => {
    setPlatform('win32');
    process.getuid = (() => 1000) as typeof process.getuid;
    const { shouldEnableChromiumSandbox } = await import('../src/browser-manager');
    expect(shouldEnableChromiumSandbox()).toBe(false);
  });

  it('linux + CI=1 → false', async () => {
    setPlatform('linux');
    process.env.CI = '1';
    process.getuid = (() => 1000) as typeof process.getuid;
    const { shouldEnableChromiumSandbox } = await import('../src/browser-manager');
    expect(shouldEnableChromiumSandbox()).toBe(false);
  });

  it('linux + CONTAINER=1 → false', async () => {
    setPlatform('linux');
    process.env.CONTAINER = '1';
    process.getuid = (() => 1000) as typeof process.getuid;
    const { shouldEnableChromiumSandbox } = await import('../src/browser-manager');
    expect(shouldEnableChromiumSandbox()).toBe(false);
  });

  it('linux + root (uid 0) → false', async () => {
    setPlatform('linux');
    process.getuid = (() => 0) as typeof process.getuid;
    const { shouldEnableChromiumSandbox } = await import('../src/browser-manager');
    expect(shouldEnableChromiumSandbox()).toBe(false);
  });
});

// ─── resolveDisconnectCause ──────────────────────────────────────
//
// Pinning the clean-vs-crash distinction matters because gbd's
// HealthMonitor consumes our exit code (0 = don't restart, !=0 =
// restart). A regression here brings back the "Cmd+Q makes the browser
// keep coming back" UX bug.

function makeFakeBrowser(opts: {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  /** ms before emitting 'exit'; default = already exited at construction */
  exitDelay?: number;
}): { process(): { exitCode: number | null; signalCode: NodeJS.Signals | null; once: EventEmitter['once'] } } {
  const ee = new EventEmitter();
  const state = {
    exitCode: opts.exitDelay != null ? null : opts.exitCode,
    signalCode: opts.exitDelay != null ? null : opts.signalCode,
    once: ee.once.bind(ee),
  };
  if (opts.exitDelay != null) {
    setTimeout(() => {
      state.exitCode = opts.exitCode;
      state.signalCode = opts.signalCode;
      ee.emit('exit', opts.exitCode, opts.signalCode);
    }, opts.exitDelay);
  }
  return { process: () => state };
}

describe('resolveDisconnectCause', () => {
  it('clean: process already exited with code 0', async () => {
    const { resolveDisconnectCause } = await import('../src/browser-manager');
    const fake = makeFakeBrowser({ exitCode: 0, signalCode: null });
    expect(await resolveDisconnectCause(fake as never)).toBe('clean');
  });

  it('crash: non-zero exit code', async () => {
    const { resolveDisconnectCause } = await import('../src/browser-manager');
    const fake = makeFakeBrowser({ exitCode: 1, signalCode: null });
    expect(await resolveDisconnectCause(fake as never)).toBe('crash');
  });

  it('crash: SIGSEGV', async () => {
    const { resolveDisconnectCause } = await import('../src/browser-manager');
    const fake = makeFakeBrowser({ exitCode: null, signalCode: 'SIGSEGV' });
    expect(await resolveDisconnectCause(fake as never)).toBe('crash');
  });

  it('crash: SIGKILL', async () => {
    const { resolveDisconnectCause } = await import('../src/browser-manager');
    const fake = makeFakeBrowser({ exitCode: null, signalCode: 'SIGKILL' });
    expect(await resolveDisconnectCause(fake as never)).toBe('crash');
  });

  it('clean: process exits asynchronously with code 0 within timeout', async () => {
    const { resolveDisconnectCause } = await import('../src/browser-manager');
    const fake = makeFakeBrowser({ exitCode: 0, signalCode: null, exitDelay: 50 });
    expect(await resolveDisconnectCause(fake as never)).toBe('clean');
  });

  it('crash: process exits asynchronously with non-zero code', async () => {
    const { resolveDisconnectCause } = await import('../src/browser-manager');
    const fake = makeFakeBrowser({ exitCode: 137, signalCode: null, exitDelay: 50 });
    expect(await resolveDisconnectCause(fake as never)).toBe('crash');
  });

  it('crash: null browser returns crash (defensive default)', async () => {
    const { resolveDisconnectCause } = await import('../src/browser-manager');
    expect(await resolveDisconnectCause(null)).toBe('crash');
  });

  // Regression: persistent contexts in headed mode expose a Browser stub
  // whose `.process` is undefined (not a function). Pre-fix, calling
  // `browser?.process()` on such a value threw an unhandled rejection
  // ("browser?.process is not a function"), crashed the bun process, and
  // put gbd into a respawn loop on every tab close. The contract for that
  // case is: default to 'clean' so gbd exits 0 and the user keeps lifecycle
  // control. Live evidence in gbrowser amsterdam-v7's browse-server.log
  // before this fix landed.
  it('clean: browser without .process method (persistent context)', async () => {
    const { resolveDisconnectCause } = await import('../src/browser-manager');
    const fake = {} as never;  // truthy, no .process → would have thrown pre-fix
    expect(await resolveDisconnectCause(fake)).toBe('clean');
  });
});
