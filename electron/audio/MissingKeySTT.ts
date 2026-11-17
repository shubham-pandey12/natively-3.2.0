import { EventEmitter } from 'node:events';
import { sttProviderName } from './sttFailover';

export const MISSING_STT_KEY_CODE = 'stt_key_missing';

export function missingSttKeyMessage(provider: string): string {
  const key = provider === 'natively' ? 'Natively key' : `${sttProviderName(provider)} API key`;
  return `No ${key} is saved, so nothing is being transcribed. Add it in Settings → Audio, or choose another speech provider there.`;
}

export class MissingKeySTT extends EventEmitter {
  private active = false;
  private reportScheduled = false;
  constructor(private readonly provider: string) { super(); }
  start(): void {
    if (this.active) return;
    this.active = true;
    if (this.reportScheduled) return;
    this.reportScheduled = true;
    setImmediate(() => {
      this.reportScheduled = false;
      if (!this.active || this.listenerCount('error') === 0) return;
      this.emit('error', Object.assign(new Error(missingSttKeyMessage(this.provider)), { code: MISSING_STT_KEY_CODE, terminal: true }));
    });
  }
  stop(): void { this.active = false; }
  write(_chunk: Buffer): void {}
  setSampleRate(_rate: number): void {}
  setAudioChannelCount(_count: number): void {}
  setRecognitionLanguage(_language: string): void {}
  setCredentials(_path: string): void {}
  notifySpeechEnded(): void {}
  finalize(): void {}
}
