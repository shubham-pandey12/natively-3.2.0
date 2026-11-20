// On-device Auto Answer model: download/remove and judge-cost savings.
// Ported 1:1 from recovered Natively 3.2.0 (premium/src/AutoAnswerModelCard.tsx).
import React, { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { useT } from '../../src/i18n';
import type { AutoAnswerModelInstall, AutoAnswerModelSavings } from '../../src/types/electron';

type Status = { install: AutoAnswerModelInstall; savings: AutoAnswerModelSavings; judgeViaNatively?: boolean };

const BUTTON = 'shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-bg-input hover:bg-bg-elevated text-text-primary border border-border-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5';

export function formatTokens(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n));
}

export function formatUsd(n: number): string {
  return n <= 0 ? '$0' : n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`;
}

const formatMb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

export const AutoAnswerModelCard: React.FC<{ icon?: React.ReactNode }> = ({ icon }) => {
  const t = useT();
  const reduced = useReducedMotion() ?? false;
  const [install, setInstall] = useState<AutoAnswerModelInstall | null>(null);
  const [savings, setSavings] = useState<AutoAnswerModelSavings | null>(null);
  const [judgeViaNatively, setJudgeViaNatively] = useState(false);
  const [busy, setBusy] = useState(false);
  const apply = useCallback((s: Status | null | undefined) => {
    if (s) { setInstall(s.install); setSavings(s.savings); setJudgeViaNatively(s.judgeViaNatively === true); }
  }, []);
  useEffect(() => {
    window.electronAPI?.getAutoAnswerModelStatus?.().then(apply).catch(() => { });
    const off = window.electronAPI?.onAutoAnswerModelProgress?.((next) => setInstall(next));
    return () => { off?.(); };
  }, [apply]);
  if (!install || install.state === 'unsupported') return null;

  const download = async () => { setBusy(true); try { apply(await window.electronAPI?.installAutoAnswerModel?.()); } catch { } setBusy(false); };
  const remove = async () => { setBusy(true); try { apply(await window.electronAPI?.removeAutoAnswerModel?.()); } catch { } setBusy(false); };

  const before = savings?.before;
  const after = savings?.after;
  const projection = savings?.projection;
  const localPct = projection ? Math.round(projection.localShare * 100) : null;
  const empty = (before?.judgeCalls ?? 0) === 0 && (!after || after.moments === 0);
  const lines: string[] = [];
  if (install.state !== 'not_entitled' && before) {
    if (empty) {
      lines.push(`${t(after ? 'No Auto Answer meetings since the download yet.' : 'No Auto Answer meetings in the last 7 days yet.')}${localPct !== null ? ` ${t('With the model, about')} ${localPct}% ${t('of moments are decided on this computer.')}` : ''}`);
    } else if (after) {
      lines.push(`${t('7 days before the download')}: ${before.judgeCalls} ${t('judge calls')} · ≈ ${formatUsd(before.usd)}`);
      lines.push(`${t('Since the download')}: ${after.local} ${t('of')} ${after.moments} ${t('decided on this computer')} · ${after.judged} ${t('judge calls')} · ${t('saved')} ≈ ${formatUsd(after.usdSaved)}`);
    } else if (projection) {
      lines.push(`${t('Last 7 days')}: ${before.judgeCalls} ${t('judge calls')} · ≈ ${formatTokens(before.tokens)} ${t('tokens')} · ≈ ${formatUsd(before.usd)}`);
      lines.push(`${t('With the model')}: ~${Math.max(0, before.judgeCalls - projection.judgeCallsSaved)} ${t('judge calls')} · ${t('saves')} ≈ ${formatUsd(projection.usdSaved)} (${localPct}% ${t('decided on this computer')})`);
    }
  }

  return (
    <motion.div
      className="px-4 py-3"
      data-testid="auto-answer-model-card"
      initial={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(2px)' }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      transition={{ duration: reduced ? 0.15 : 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={`${icon ? '' : 'pl-14 '}flex items-start justify-between gap-4`}>
        <div className="flex items-start gap-4 min-w-0">
          {icon && <div className="w-10 h-10 bg-bg-settings-tile rounded-lg border border-border-subtle text-text-primary flex items-center justify-center shrink-0">{icon}</div>}
          <div className="min-w-0">
            <h3 className="settings-title text-text-primary">{t('On-device Auto Answer model')}</h3>
            <p className="text-xs text-text-secondary mt-0.5">{install.state === 'not_entitled'
              ? t('Included with Natively Pro and Natively API keys. It decides most moments on this computer, so fewer go to the AI judge.')
              : t('Decides most moments on this computer, so fewer go to the AI judge.')}</p>
            {lines.map((line) => <p key={line} className="text-xs text-text-secondary mt-0.5">{line}</p>)}
            {lines.length > 0 && !empty && savings && (
              <p className="text-[11px] text-text-tertiary mt-1">{judgeViaNatively
                ? t('Estimates: tokens from each prompt’s length, at a typical judge model’s list price. With Natively API, your plan covers these calls.')
                : <>{t('Estimates: tokens from each prompt’s length, priced at')} {savings.reference.model} {t('list price. Your provider’s price may differ.')}</>}</p>
            )}
            {install.state === 'error' && <p className="text-xs text-text-tertiary mt-1" role="status">{t('Download failed:')} {install.error}</p>}
          </div>
        </div>
        {install.state === 'available' || install.state === 'error' ? (
          <button type="button" className={BUTTON} disabled={busy} onClick={download}>
            <Download size={12} strokeWidth={1.75} aria-hidden="true" />
            <span>{install.state === 'available' ? `${t('Download')} · ${formatMb(install.bytes)}` : t('Try again')}</span>
          </button>
        ) : install.state === 'downloading' ? (
          <div className="shrink-0 text-xs text-text-secondary flex items-center justify-end gap-1.5 py-1.5" role="status" aria-live="polite">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            {Math.floor(install.received / Math.max(1, install.total) * 100)}%
          </div>
        ) : install.state === 'installed' ? (
          <button type="button" className={BUTTON} disabled={busy} onClick={remove}>
            <Trash2 size={12} strokeWidth={1.75} aria-hidden="true" />
            <span>{t('Remove')}</span>
          </button>
        ) : null}
      </div>
    </motion.div>
  );
};

export default AutoAnswerModelCard;
