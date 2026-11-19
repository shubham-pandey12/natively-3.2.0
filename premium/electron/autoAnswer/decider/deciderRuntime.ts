/**
 * Which decider model build and ONNX runtime this machine runs, and where the session lives.
 *
 *   int8 on onnxruntime 1.24 (npm alias onnxruntime-node-decider), inside a utility process:
 *       Windows x64/arm64, and Apple-silicon Macs on macOS 14+.
 *   q4 on the app's own onnxruntime 1.22, on a worker thread:
 *       other Macs on macOS 13.3+ (Darwin 22.4+), Intel included.
 *
 * Anything older or any other platform has no decider (null): Auto Answer keeps the LLM judge.
 * PURE: the caller passes process.platform, process.arch and os.release().
 */

export type DeciderRuntimeId = 'ort-1.22' | 'ort-1.24';
export type DeciderVariant = 'int8' | 'q4';
export type DeciderOrtModule = 'onnxruntime-node' | 'onnxruntime-node-decider';

export interface DeciderRuntimeChoice {
    variant: DeciderVariant;
    runtime: DeciderRuntimeId;
    /** `utility`: an Electron utility process; `thread`: a worker_threads Worker. */
    host: 'utility' | 'thread';
    ortModule: DeciderOrtModule;
}

const INT8: DeciderRuntimeChoice = { variant: 'int8', runtime: 'ort-1.24', host: 'utility', ortModule: 'onnxruntime-node-decider' };
const Q4: DeciderRuntimeChoice = { variant: 'q4', runtime: 'ort-1.22', host: 'thread', ortModule: 'onnxruntime-node' };

/** Darwin kernel release "23.4.0" -> [23, 4]; null when it cannot be read. */
function darwinVersion(release: string): [number, number] | null {
    const [major, minor] = release.split('.').map((n) => parseInt(n, 10));
    if (!Number.isFinite(major)) return null;
    return [major, Number.isFinite(minor) ? minor : 0];
}

export function chooseDeciderRuntime(platform: NodeJS.Platform, arch: string, release: string): DeciderRuntimeChoice | null {
    switch (platform) {
        case 'win32':
            return arch === 'x64' || arch === 'arm64' ? INT8 : null;
        case 'darwin': {
            const v = darwinVersion(release);
            if (!v) return null;
            const [major, minor] = v;
            // macOS 13.3 is Darwin 22.4; macOS 14 is Darwin 23.
            const atLeast133 = major > 22 || (major === 22 && minor >= 4);
            if (!atLeast133) return null;
            if (arch === 'arm64' && major >= 23) return INT8;
            if (arch === 'arm64' || arch === 'x64') return Q4;
            return null;
        }
        default:
            return null;
    }
}

/** The npm module that loads a given runtime. */
export function ortModuleFor(runtime: DeciderRuntimeId): DeciderOrtModule {
    return runtime === 'ort-1.24' ? 'onnxruntime-node-decider' : 'onnxruntime-node';
}
