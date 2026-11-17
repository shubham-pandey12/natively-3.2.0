import { isCoveredByLive } from './sttGapRecovery';

export const MIC_ECHO_WINDOW_MS = 8_000;
export const MIC_ECHO_MIN_WORDS = 3;
export const MIC_ECHO_PAIR_SHARE = 0.7;

export class MicEchoGuard {
  private finals: Array<{ text: string; at: number }> = [];
  private interim: { text: string; at: number } | null = null;
  noteInterviewer(text: string, isFinal: boolean, nowMs: number): void {
    const t = (text ?? '').trim();
    if (!t) return;
    if (isFinal) {
      this.finals.push({ text: t, at: nowMs });
      this.interim = null;
      this.prune(nowMs);
    } else {
      this.interim = { text: t, at: nowMs };
    }
  }
  /** Whether a mic final repeats what the interviewer just said. */
  isEcho(text: string, nowMs: number): boolean {
    const t = (text ?? '').trim();
    if (t.split(/\s+/).filter(Boolean).length < MIC_ECHO_MIN_WORDS) return false;
    this.prune(nowMs);
    const heard = this.finals.map(f => f.text);
    if (this.interim && nowMs - this.interim.at <= MIC_ECHO_WINDOW_MS) heard.push(this.interim.text);
    if (heard.length === 0) return false;
    return isCoveredByLive(t, heard, MIC_ECHO_PAIR_SHARE);
  }
  reset(): void { this.finals = []; this.interim = null; }
  private prune(nowMs: number): void {
    const cutoff = nowMs - MIC_ECHO_WINDOW_MS;
    if (this.finals.length && this.finals[0].at < cutoff) this.finals = this.finals.filter(f => f.at >= cutoff);
  }
}
