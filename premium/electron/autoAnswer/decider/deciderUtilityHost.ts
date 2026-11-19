/**
 * The int8 decider on onnxruntime 1.24 runs in an Electron utility process (deciderRuntime).
 * This wraps the child so LocalLayaBackend sees the same WorkerLike it gets from a worker thread:
 * messages queue until the child says hello, and stop() asks for shutdown then kills after a grace.
 */
import type { WorkerLike } from './LocalLayaBackend';

export const STOP_GRACE_MS = 3_000;

/** The parts of Electron's UtilityProcess this wrapper uses. */
export interface UtilityChildLike {
    on(event: 'message', fn: (msg: any) => void): unknown;
    on(event: 'exit', fn: (code: number) => void): unknown;
    on(event: 'error', fn: (type: string, location: string) => void): unknown;
    postMessage(msg: unknown): void;
    kill(): boolean | void;
}

export interface UtilityTimers {
    setTimeout(fn: () => void, ms: number): any;
    clearTimeout(t: any): void;
}

export interface DeciderUtilityWorker extends WorkerLike {
    utility: true;
    stop(): void;
}

type Event = 'message' | 'error' | 'exit';

export function wrapDeciderUtility(child: UtilityChildLike, timers: UtilityTimers = { setTimeout, clearTimeout }): DeciderUtilityWorker {
    const listeners: Record<Event, Array<(arg: any) => void>> = { message: [], error: [], exit: [] };
    let ready = false;
    let gone = false;
    let queue: unknown[] = [];
    let killTimer: any = null;
    child.on('message', (msg: any) => {
        if (msg?.type === 'hello') {
            ready = true;
            const q = queue;
            queue = [];
            for (const m of q) child.postMessage(m);
            return;
        }
        for (const fn of listeners.message) fn(msg);
    });
    child.on('exit', (code: number) => {
        gone = true;
        queue = [];
        if (killTimer) { timers.clearTimeout(killTimer); killTimer = null; }
        for (const fn of listeners.exit) fn(code);
    });
    child.on('error', (type: string, location: string) => {
        for (const fn of listeners.error) fn(new Error(`decider utility process fatal error (${type} at ${location})`));
    });
    const send = (m: unknown) => {
        if (gone) throw new Error('decider utility process is gone');
        if (ready) child.postMessage(m);
        else queue.push(m);
    };
    return {
        utility: true,
        postMessage: send,
        on(event: Event, fn: (arg: any) => void) {
            listeners[event].push(fn);
            return this;
        },
        stop() {
            if (gone) return;
            try { send({ type: 'shutdown' }); } catch { /* already gone */ }
            killTimer = timers.setTimeout(() => { try { child.kill(); } catch { /* best effort */ } }, STOP_GRACE_MS);
            killTimer?.unref?.();
        },
    };
}

export function forkDeciderUtility(workerScript: string): DeciderUtilityWorker {
    const { utilityProcess } = require('electron') as typeof import('electron');
    const child = utilityProcess.fork(workerScript, [], {
        serviceName: 'Natively Auto Answer',
        // Inherited so the worker's runtime errors land in the app log; it never logs transcript text.
        stdio: 'inherit',
    });
    return wrapDeciderUtility(child as unknown as UtilityChildLike);
}
