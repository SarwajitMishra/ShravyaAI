// src/lib/call-debug.ts
export type CP = `CP-${string}`;

export const callDbg = {
  on: true,                       // flip to false to silence logs
  log(cp: CP, msg: string, extra?: any) {
    if (!this.on) return;
    const stamp = new Date().toISOString();
    const line = `[CALLDBG] ${stamp} | ${cp} | ${msg}`;
    // keep a rolling buffer on window for easy copy/paste
    (globalThis as any).__CALLDBG__ ??= [];
    (globalThis as any).__CALLDBG__.push({ stamp, cp, msg, extra });
    // eslint-disable-next-line no-console
    extra === undefined ? console.log(line) : console.log(line, extra);
  }
};
