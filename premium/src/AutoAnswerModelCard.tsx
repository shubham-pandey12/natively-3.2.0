import React, { useEffect, useState } from 'react';
import type { AutoAnswerModelInstall, AutoAnswerModelSavings } from '../../src/types/electron';

type Status = { install: AutoAnswerModelInstall; savings: AutoAnswerModelSavings; judgeViaNatively: boolean };

export function AutoAnswerModelCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.electronAPI.getAutoAnswerModelStatus?.().then(setStatus).catch(() => {});
    return window.electronAPI.onAutoAnswerModelProgress?.(install =>
      setStatus(current => current && { ...current, install }));
  }, []);
  if (!status || status.install.state === 'unsupported') return null;
  const { install, savings, judgeViaNatively } = status;
  const act = async (kind: 'install' | 'remove') => {
    setBusy(true);
    try {
      const next = await (kind === 'install' ? window.electronAPI.installAutoAnswerModel?.() : window.electronAPI.removeAutoAnswerModel?.());
      if (next) setStatus(next);
    } catch { /* the next status read reports installer errors */ }
    finally { setBusy(false); }
  };
  const cost = (value: number) => value < .01 && value > 0 ? '<$0.01' : `$${value.toFixed(2)}`;
  return <section className="flex items-start justify-between gap-4 px-4 py-3" data-testid="auto-answer-model-card">
    <div className="min-w-0 pl-14">
      <h3 className="settings-title text-text-primary">On-device Auto Answer model</h3>
      <p className="mt-0.5 text-xs text-text-secondary">{install.state === 'not_entitled' ? 'Included with Natively Pro and Natively API keys. It decides most moments on this computer, so fewer go to the AI judge.' : 'Decides most moments on this computer, so fewer go to the AI judge.'}</p>
      {install.state !== 'not_entitled' && <>
        <p className="mt-0.5 text-xs text-text-secondary">Last 7 days: {savings.before.judgeCalls} judge calls · ≈ {cost(savings.before.usd)}</p>
        {savings.after && <p className="mt-0.5 text-xs text-text-secondary">Since the download: {savings.after.local} of {savings.after.moments} decided on this computer · saved ≈ {cost(savings.after.usdSaved)}</p>}
        {savings.projection && !savings.after && <p className="mt-0.5 text-xs text-text-secondary">With the model, about {Math.round(savings.projection.localShare * 100)}% of moments are decided on this computer.</p>}
        <p className="mt-1 text-[11px] text-text-tertiary">{judgeViaNatively ? 'With Natively API, your plan covers AI judge calls.' : `Estimates use ${savings.reference.model} list price. Your provider’s price may differ.`}</p>
      </>}
      {install.state === 'error' && <p role="status" className="mt-1 text-xs text-text-tertiary">Download failed: {install.error}</p>}
    </div>
    {(install.state === 'available' || install.state === 'error') && <button type="button" disabled={busy} onClick={() => void act('install')} className="shrink-0 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-primary disabled:opacity-40">{install.state === 'available' ? `Download · ${Math.round(install.bytes / 1e6)} MB` : 'Try again'}</button>}
    {install.state === 'downloading' && <span role="status" aria-live="polite" className="shrink-0 text-xs text-text-secondary">{Math.floor(install.received / Math.max(1, install.total) * 100)}%</span>}
    {install.state === 'installed' && <button type="button" disabled={busy} onClick={() => void act('remove')} className="shrink-0 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-primary disabled:opacity-40">Remove</button>}
  </section>;
}
