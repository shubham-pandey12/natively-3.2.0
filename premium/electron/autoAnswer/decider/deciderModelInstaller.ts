/**
 * The paid download of the decider graph (campaign Phase 6). The app ships the manifest and the
 * tokenizer in resources/models/auto-answer-decider; the graph for this machine's variant
 * (deciderRuntime) comes from the Natively API as signed part URLs.
 *
 *   <installRoot>/<version>-<variant>/          the installed model, a deciderManifest directory
 *   <installRoot>/<version>-<variant>.partial/  while downloading; renamed into place at the end
 *
 * Every part is size- and sha256-checked, the whole graph is checked against the shipped
 * manifest, and the shipped tokenizer files are checked before they are copied. Paths come from
 * path.join on the injected directories, so macOS and Windows take the same route.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
    AutoAnswerModelCredential, AutoAnswerModelInstall, AutoAnswerModelInstaller, AutoAnswerModelInstallerDeps,
} from '../../../../electron/premium/autoAnswer';
import { parseDeciderManifest, type DeciderManifest, type DeciderVariantEntry } from './deciderManifest';
import type { DeciderRuntimeChoice } from './deciderRuntime';

export const DECIDER_DOWNLOAD_PATH = '/v1/models/auto-answer-decider/download';

export interface DeciderModelInstallerDeps extends Omit<AutoAnswerModelInstallerDeps, 'platform' | 'arch' | 'release'> {
    /** deciderRuntime's pick for this machine; null when it runs no decider. */
    choice: DeciderRuntimeChoice | null;
    fetchImpl?: typeof fetch;
}

interface DownloadPart { url: string; sha256: string; bytes: number }

class InstallError extends Error {
    constructor(message: string, readonly retryable: boolean, readonly notEntitled = false) {
        super(message);
    }
}

const sha256File = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

export class DeciderModelInstaller implements AutoAnswerModelInstaller {
    private running: Promise<AutoAnswerModelInstall> | null = null;
    private progress: { received: number; total: number } | null = null;
    private lastError: { error: string; retryable: boolean } | null = null;
    private shipped: DeciderManifest | null | undefined;

    constructor(private deps: DeciderModelInstallerDeps) {}

    private manifest(): DeciderManifest | null {
        if (this.shipped !== undefined) return this.shipped;
        try {
            this.shipped = parseDeciderManifest(JSON.parse(fs.readFileSync(path.join(this.deps.bundledDir, 'manifest.json'), 'utf8')));
        } catch (e) {
            this.deps.log?.warn?.(`[DeciderInstaller] shipped manifest unreadable: ${e instanceof Error ? e.message : e}`);
            this.shipped = null;
        }
        return this.shipped;
    }

    private variantEntry(): { m: DeciderManifest; c: DeciderRuntimeChoice; v: DeciderVariantEntry } | null {
        const m = this.manifest();
        const c = this.deps.choice;
        if (!m || !c) return null;
        const v = m.variants[c.variant];
        return v && v.runtime === c.runtime ? { m, c, v } : null;
    }

    private targetDir(): string | null {
        const e = this.variantEntry();
        return e ? path.join(this.deps.installRoot, `${e.m.version}-${e.c.variant}`) : null;
    }

    /** The installed model directory for this app version and machine, or null. Size-checked; sha256 was checked at install. */
    installedDir(): string | null {
        const e = this.variantEntry();
        const dir = this.targetDir();
        if (!e || !dir) return null;
        try {
            const installed = parseDeciderManifest(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')));
            if (installed.version !== e.m.version || installed.graph !== e.v.graph || installed.runtime !== e.v.runtime) return null;
            return fs.statSync(path.join(dir, e.v.graph)).size === e.v.bytes ? dir : null;
        } catch { return null; }
    }

    status(): AutoAnswerModelInstall {
        const e = this.variantEntry();
        if (!e) return { state: 'unsupported' };
        const dir = this.installedDir();
        if (dir) return { state: 'installed', variant: e.c.variant, version: e.m.version, dir };
        if (this.running && this.progress) return { state: 'downloading', variant: e.c.variant, ...this.progress };
        if (!this.deps.credential()) return { state: 'not_entitled' };
        if (this.lastError) return { state: 'error', variant: e.c.variant, ...this.lastError };
        return { state: 'available', variant: e.c.variant, bytes: e.v.bytes };
    }

    /** Download, verify and install. Concurrent calls share one run. */
    install(onProgress?: (s: AutoAnswerModelInstall) => void, signal?: AbortSignal): Promise<AutoAnswerModelInstall> {
        if (this.running) return this.running;
        this.running = this.run(onProgress, signal).finally(() => { this.running = null; this.progress = null; });
        return this.running;
    }

    /** Delete every installed copy (Settings "Remove"). */
    remove(): void {
        try { fs.rmSync(this.deps.installRoot, { recursive: true, force: true }); } catch { /* best effort */ }
        this.lastError = null;
    }

    private async run(onProgress?: (s: AutoAnswerModelInstall) => void, signal?: AbortSignal): Promise<AutoAnswerModelInstall> {
        const e = this.variantEntry();
        const dir = this.targetDir();
        if (!e || !dir) return { state: 'unsupported' };
        if (this.installedDir()) return this.status();
        const cred = this.deps.credential();
        if (!cred) return { state: 'not_entitled' };
        const partial = `${dir}.partial`;
        this.lastError = null;
        try {
            const parts = await this.requestLinks(cred, e.m.version, e.c.variant, signal);
            const total = parts.reduce((n, p) => n + p.bytes, 0);
            if (total !== e.v.bytes) throw new InstallError('the server offered a model of the wrong size', false);
            fs.rmSync(partial, { recursive: true, force: true });
            fs.mkdirSync(partial, { recursive: true });
            this.progress = { received: 0, total };
            onProgress?.(this.status());
            await this.downloadGraph(parts, path.join(partial, e.v.graph), e.v.sha256, signal, (received) => {
                this.progress = { received, total };
                onProgress?.(this.status());
            });
            // The tokenizer and the rest ship with the app: verified, then copied beside the graph.
            for (const f of e.m.files.filter((x) => x.path !== e.v.graph)) {
                const src = path.join(this.deps.bundledDir, ...f.path.split('/'));
                if (sha256File(src) !== f.sha256) throw new InstallError(`shipped ${f.path} does not match its manifest`, false);
                const dst = path.join(partial, ...f.path.split('/'));
                fs.mkdirSync(path.dirname(dst), { recursive: true });
                fs.copyFileSync(src, dst);
            }
            // The installed manifest names the one graph it holds.
            const raw = JSON.parse(fs.readFileSync(path.join(this.deps.bundledDir, 'manifest.json'), 'utf8'));
            delete raw.variants;
            raw.graph = e.v.graph;
            raw.runtime = e.v.runtime;
            raw.installed_variant = e.c.variant;
            raw.files = [{ path: e.v.graph, sha256: e.v.sha256, bytes: e.v.bytes }, ...e.m.files.filter((x) => x.path !== e.v.graph)];
            fs.writeFileSync(path.join(partial, 'manifest.json'), JSON.stringify(raw, null, 2));
            // One installed copy: older versions and variants go.
            if (fs.existsSync(this.deps.installRoot)) {
                for (const name of fs.readdirSync(this.deps.installRoot)) {
                    const p = path.join(this.deps.installRoot, name);
                    if (p !== partial) fs.rmSync(p, { recursive: true, force: true });
                }
            }
            fs.renameSync(partial, dir);
            this.deps.log?.info?.(`[DeciderInstaller] installed ${e.m.version} ${e.c.variant}`);
            const done = this.status();
            onProgress?.(done);
            return done;
        } catch (err) {
            try { fs.rmSync(partial, { recursive: true, force: true }); } catch { /* best effort */ }
            this.progress = null;
            const ie = err instanceof InstallError
                ? err
                : new InstallError(signal?.aborted ? 'cancelled' : `network: ${err instanceof Error ? err.message : String(err)}`, true);
            if (ie.notEntitled) {
                this.lastError = null;
                const s2: AutoAnswerModelInstall = { state: 'not_entitled' };
                onProgress?.(s2);
                return s2;
            }
            this.lastError = { error: ie.message, retryable: ie.retryable };
            this.deps.log?.warn?.(`[DeciderInstaller] install failed: ${ie.message}`);
            const s = this.status();
            onProgress?.(s);
            return s;
        }
    }

    private async requestLinks(cred: AutoAnswerModelCredential, version: string, variant: string, signal?: AbortSignal): Promise<DownloadPart[]> {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (cred.kind === 'api_key') headers['x-natively-key'] = cred.key;
        else {
            headers['x-natively-pro-license'] = cred.key;
            headers['x-natively-pro-provider'] = cred.provider;
        }
        const f = this.deps.fetchImpl ?? fetch;
        const res = await f(`${this.deps.apiBase}${DECIDER_DOWNLOAD_PATH}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ version, variant }),
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
        });
        const body: any = await res.json().catch(() => null);
        if (res.status === 401 || res.status === 403) throw new InstallError(String(body?.error || 'not entitled'), false, true);
        if (res.status === 404) throw new InstallError('this model version is no longer offered; update Natively', false);
        if (res.status === 429) throw new InstallError('too many downloads today; try again tomorrow', true);
        if (!res.ok || !body?.ok || !Array.isArray(body.parts) || body.parts.length < 1) throw new InstallError(`server answered ${res.status}`, true);
        for (const p of body.parts) {
            if (typeof p?.url !== 'string' || !/^https:\/\//.test(p.url) || !/^[0-9a-f]{64}$/.test(String(p.sha256)) || !Number.isInteger(p.bytes)) {
                throw new InstallError('the server answered an unreadable part list', true);
            }
        }
        return body.parts as DownloadPart[];
    }

    private async downloadGraph(parts: DownloadPart[], dest: string, graphSha: string, signal: AbortSignal | undefined, onBytes: (received: number) => void): Promise<void> {
        const f = this.deps.fetchImpl ?? fetch;
        const whole = crypto.createHash('sha256');
        const fd = fs.openSync(dest, 'w');
        let received = 0;
        try {
            for (const p of parts) {
                const res = await f(p.url, { signal });
                if (!res.ok || !res.body) throw new InstallError(`part download answered ${res.status}`, true);
                const h = crypto.createHash('sha256');
                let n = 0;
                const reader = res.body.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const buf = Buffer.from(value);
                    n += buf.length;
                    if (n > p.bytes) throw new InstallError('a part was longer than announced', true);
                    h.update(buf);
                    whole.update(buf);
                    fs.writeSync(fd, buf);
                    received += buf.length;
                    onBytes(received);
                }
                if (n !== p.bytes || h.digest('hex') !== p.sha256) throw new InstallError('a downloaded part failed its checksum', true);
            }
        } finally {
            fs.closeSync(fd);
        }
        if (whole.digest('hex') !== graphSha) throw new InstallError('the downloaded model does not match this app’s manifest', false);
    }
}
