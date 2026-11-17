import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { useT } from '../../i18n';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';
import GlassSurface from '../../ui-components/GlassSurface';
import { LiquidGlassButton } from '../../ui-components/LiquidGlassButton';
import { GUIDE_STEP_NUMBERS, GUIDE_STEP_TOTAL, useGuideAnchor, useGuideHighlight, useRecoveredGuide, type GuideState } from './useRecoveredGuide';
import './RecoveredGuide.css';

type TipProps = {
  anchor: string; width?: number; dx?: number; stepId: string; title: string; body: string;
  list?: Array<[string, 'done' | 'now' | 'todo', string | undefined]>;
  waiting?: string; action?: { label: string; onClick: () => void; disabled?: boolean };
  done?: boolean; lit?: boolean; onSkip?: () => void;
};

function GuideGlass({ radius }: { radius: number }) {
  const isLight = useResolvedTheme() === 'light';
  return <span className="guide-glass" aria-hidden="true" style={{ borderRadius: radius }}>
    <span className="guide-glass-frost" />
    <GlassSurface className="guide-glass-lens" contentClassName="glass-surface__content--bare" width="100%" height="100%" borderRadius={radius} borderWidth={0.18} brightness={55} opacity={0.9} blur={4} displace={1} tint="transparent" saturation={1.3} distortionScale={isLight ? -36 : -64} redOffset={0} greenOffset={0} blueOffset={0} xChannel="R" yChannel="B" mixBlendMode="screen" />
    <span className="glass-cta__bevel" /><span className="glass-cta__sheen" /><span className="glass-cta__edge" />
  </span>;
}

function GuideTip({ anchor, width = 320, dx = 0, stepId, title, body, list, waiting, action, done, lit = true, onSkip }: TipProps) {
  const t = useT();
  const bounds = useGuideAnchor(anchor);
  useGuideHighlight(lit && bounds ? anchor : null);
  if (!bounds) return null;
  const count = t('{n} of {total}').replace('{n}', String(GUIDE_STEP_NUMBERS[stepId])).replace('{total}', String(GUIDE_STEP_TOTAL));
  const center = bounds.left + bounds.width / 2;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, center - width / 2 + dx));
  const arrow = Math.max(22, Math.min(width - 22, center - left));
  return createPortal(<div className="guide-enter guide-tip" style={{ position: 'fixed', left, top: bounds.bottom + 18, width, zIndex: 2147483001, transformOrigin: `${arrow}px -8px` }} role="dialog" aria-label={title} data-guide-card={stepId}>
    <div className="guide-tip-arrow" style={{ left: arrow - 9 }} aria-hidden="true" />
    <div className="guide-tip-shell"><GuideGlass radius={18} /><div className="guide-tip-inner">
      <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="guide-tip-title">{title}</div><div className="guide-tip-body">{body}</div></div>
        {onSkip && !done && <button type="button" className="guide-tip-close" onClick={onSkip} aria-label={t('Skip guide')} title={t('Skip guide')}><X className="w-3.5 h-3.5" strokeWidth={2} /></button>}
      </div>
      {list && <ul className="guide-tip-list">{list.map(([label, status, hint]) => <li className={`guide-tip-row is-${status}`} key={label}><span aria-hidden="true" className="guide-tick">{status === 'done' && <Check className="w-2.5 h-2.5" strokeWidth={3.5} />}</span><span className="min-w-0 truncate">{label}</span>{status === 'done' && <span className="sr-only">{t('Done')}</span>}{hint && <span className="guide-tip-hint">{hint}</span>}</li>)}</ul>}
      <div className="guide-tip-foot"><span className="guide-tip-count" aria-label={count}>{count}</span>{done ? <span role="status" className="guide-tip-status is-done"><Check className="w-3.5 h-3.5" strokeWidth={2.6} aria-hidden="true" />{t('Done')}</span> : action ? <LiquidGlassButton variant="lavender" className="lg-sm" disabled={action.disabled} onClick={action.onClick}>{action.label}</LiquidGlassButton> : waiting ? <span role="status" className="guide-tip-status is-waiting"><i className="guide-wait-dot" aria-hidden="true" />{waiting}</span> : null}</div>
    </div></div>
  </div>, document.body);
}

function ContinueGuide({ onContinue, onSkip }: { onContinue: () => void; onSkip: () => void }) {
  const t = useT();
  return createPortal(<div style={{ position: 'fixed', left: 0, right: 0, bottom: 20, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 2147483001 }}><div className="guide-enter guide-pill" data-guide-card="continue" style={{ pointerEvents: 'auto', transformOrigin: '50% 100%' }}><div className="guide-pill-shell"><GuideGlass radius={22} /><div className="guide-pill-row"><button type="button" className="guide-skip" onClick={onSkip}>{t('Skip guide')}</button><LiquidGlassButton variant="lavender" className="lg-sm" onClick={onContinue}>{t('Continue the guide')}</LiquidGlassButton></div></div></div></div>, document.body);
}

const FALLBACK_ANCHORS: Record<string, string> = { notes: '[data-guide="meeting-tabs"]', surface: '[data-guide="surface-switch"]', start2: '[data-guide="start"]', notes2: '[data-guide="meeting-tabs"]', plans: '[data-guide="nav-plans"]', keys: '[data-guide="nav-ai-providers"]' };
const SETTINGS_TARGETS: Record<string, string> = { surface: 'overlay', plans: 'plans', keys: 'ai-providers' };

export function LauncherGuide({ onOpenSettings, onOpenMeeting, onShowHome }: { onOpenSettings: (tab: string) => void; onOpenMeeting: (id: string) => void; onShowHome: () => void }) {
  const t = useT();
  const { state, justDone, dispatch } = useRecoveredGuide();
  const active = state?.status === 'active';
  const step = active ? state.step : null;
  useEffect(() => { if (!active) return; const off = window.electronAPI?.onMeetingStateChanged?.(({ isActive }) => dispatch({ type: isActive ? 'meeting_started' : 'meeting_stopped' })); return () => off?.(); }, [active, dispatch]);
  const [startKind, setStartKind] = useState<'trial' | 'plan'>('trial');
  useEffect(() => {
    if (step !== 'start') return;
    let live = true;
    const api = window.electronAPI as any;
    Promise.all([api?.getLocalTrial?.().catch(() => null), api?.getStoredCredentials?.().catch(() => null)]).then(([trial, credentials]) => {
      if (!live) return;
      setStartKind(trial?.hasToken && !trial?.expired ? 'trial' : credentials?.hasNativelyKey ? 'plan' : 'trial');
      if (trial?.expired) dispatch({ type: 'trial_out' });
      else if (trial?.trialClaimed && !trial?.hasToken) dispatch({ type: 'trial_unavailable' });
    }).catch(() => {});
    return () => { live = false; };
  }, [step, dispatch]);
  useEffect(() => { if (!active) return; const off = window.electronAPI?.onTrialAutoStart?.(value => { if (value.state === 'failed') dispatch({ type: 'trial_unavailable' }); }); return () => off?.(); }, [active, dispatch]);
  const notesStep = step === 'notes' || step === 'notes2';
  const endedId = state?.endedMeetingId ?? null;
  const openedMeeting = useRef<string | null>(null);
  useEffect(() => { if (notesStep && !justDone && endedId && openedMeeting.current !== endedId) { openedMeeting.current = endedId; onOpenMeeting(endedId); } }, [notesStep, justDone, endedId, onOpenMeeting]);
  const openedSettings = useRef<string | null>(null);
  useEffect(() => { const tab = step ? SETTINGS_TARGETS[step] : null; if (!tab || justDone) return; const key = `${step}:${state?.updatedAt ?? 0}`; if (openedSettings.current !== key) { openedSettings.current = key; onOpenSettings(tab); } }, [step, state?.updatedAt, justDone, onOpenSettings]);
  const shownHome = useRef<number | null>(null);
  useEffect(() => { if (step !== 'start2' || justDone || shownHome.current === (state?.updatedAt ?? 0)) return; shownHome.current = state?.updatedAt ?? 0; onShowHome(); }, [step, justDone, state?.updatedAt, onShowHome]);
  const skip = () => dispatch({ type: 'skip' });
  const anchorSelector = step && !justDone ? FALLBACK_ANCHORS[step] ?? null : null;
  const anchor = useGuideAnchor(anchorSelector);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { setFallback(false); if (!anchorSelector || anchor) return; const timer = setTimeout(() => setFallback(true), notesStep && !endedId ? 20_000 : 1200); return () => clearTimeout(timer); }, [anchorSelector, anchor, notesStep, endedId]);
  const continueGuide = () => { const tab = step ? SETTINGS_TARGETS[step] : null; if (notesStep && !endedId) dispatch({ type: 'notes_next' }); else if (notesStep && endedId) onOpenMeeting(endedId); else if (step === 'start2') onShowHome(); else if (tab) onOpenSettings(tab); };
  if (fallback && anchorSelector) return <ContinueGuide onContinue={continueGuide} onSkip={skip} />;
  if (active && step === 'start') return <GuideTip anchor='[data-guide="start"]' width={330} stepId="start" title={t('Start your first meeting.')} body={t(startKind === 'plan' ? 'Your plan covers it. Start now: the Natively demo plays in your browser so you can watch it work.' : 'Your free trial covers it. Start now: the Natively demo plays in your browser so you can watch it work.')} waiting={t('Waiting for you')} done={justDone} onSkip={skip} />;
  if (active && step === 'notes') return <GuideTip anchor='[data-guide="meeting-tabs"]' width={340} stepId="notes" title={t('Your meeting, written up.')} body={t('The summary and the full transcript are saved here. Find them any time on Home.')} action={{ label: t('Next'), onClick: () => dispatch({ type: 'notes_next' }) }} done={justDone} onSkip={skip} />;
  if (active && step === 'start2') return <GuideTip anchor='[data-guide="start"]' width={330} stepId="start2" title={t('Start Natively again.')} body={t('This time your meeting opens in the notepad.')} waiting={t('Waiting for you')} done={justDone} onSkip={skip} />;
  if (active && step === 'notes2') return <GuideTip anchor='[data-guide="meeting-tabs"]' width={340} stepId="notes2" title={t('Your notepad meeting, written up.')} body={t('Your notes, the summary and Ask’s answers are saved together. Find them any time on Home.')} action={{ label: t('Next'), onClick: () => dispatch({ type: 'notes_next' }) }} done={justDone} onSkip={skip} />;
  return null;
}

function trialTitle(state: GuideState | null, remainingMs: number | null, expired: boolean) {
  if (state?.variant === 'no_trial') return 'Your free trial isn’t available on this device.';
  if (state?.variant === 'trial_out' || expired || remainingMs === 0) return 'Your free trial is used up.';
  if (remainingMs === null) return 'Keep Natively Pro.';
  return remainingMs > 900_000 ? 'Keep Natively Pro after your trial.' : 'Your free trial is almost used up.';
}

export function LauncherSettingsGuide() {
  const t = useT();
  const { state, justDone, dispatch } = useRecoveredGuide();
  const surface = state?.status === 'active' && state.step === 'surface';
  const plans = state?.status === 'active' && state.step === 'plans';
  const keys = state?.status === 'active' && state.step === 'keys';
  const bought = state?.status === 'finished' && state.outcome === 'bought';
  const planChanged = useCallback(() => dispatch({ type: 'plan_changed' }), [dispatch]);
  useEffect(() => { if (!plans) return; planChanged(); const a = window.electronAPI?.onLicenseStatusChanged?.(planChanged); const b = window.electronAPI?.onCredentialsChanged?.(planChanged); return () => { a?.(); b?.(); }; }, [plans, planChanged]);
  const [trial, setTrial] = useState<{ ms: number | null; over: boolean } | null>(null);
  useEffect(() => { if (!plans) return; let live = true; window.electronAPI?.getTrialStatus?.().then(value => { if (live) { const ms = typeof value?.remaining_ms === 'number' ? Math.max(0, value.remaining_ms) : null; setTrial({ ms, over: !!value?.expired || ms === 0 }); } }).catch(() => { if (live) setTrial({ ms: null, over: false }); }); return () => { live = false; }; }, [plans]);
  const [checks, setChecks] = useState({ ai: false, stt: false, retrieval: false });
  useEffect(() => { if (!keys) return; let live = true; const update = () => { const api = window.electronAPI as any; Promise.all([api?.getStoredCredentials?.().catch(() => {}), api?.getSttProvider?.().catch(() => 'none'), api?.getEmbeddingStatus?.().catch(() => {})]).then(([credentials, stt, retrieval]) => { if (live) setChecks({ ai: !!credentials?.hasOwnAiKey, stt: !!stt && stt !== 'none' && stt !== 'natively', retrieval: !!retrieval?.active?.configured }); }); }; update(); const off = window.electronAPI?.onCredentialsChanged?.(update); const timer = setInterval(update, 4000); return () => { live = false; off?.(); clearInterval(timer); }; }, [keys]);
  const [thanks, setThanks] = useState(false);
  useEffect(() => { if (!bought || !state?.updatedAt || Date.now() - state.updatedAt > 10_000) return; setThanks(true); const timer = setTimeout(() => setThanks(false), 4000); return () => clearTimeout(timer); }, [bought, state?.updatedAt]);
  const skip = () => dispatch({ type: 'skip' });
  if (surface) return <GuideTip anchor='[data-guide="surface-switch"]' width={320} stepId="surface" title={t('Now try the notepad.')} body={t('Pick Notepad. Your next meeting opens there: write while you talk, and Ask with recipes.')} waiting={t('Waiting for you')} done={justDone} onSkip={skip} />;
  if (thanks) return <GuideTip anchor='[data-guide="nav-plans"]' width={290} dx={60} stepId="plans" title={t('Thanks. You’re all set.')} body={t('Your plan covers the AI and speech-to-text. Start a meeting any time.')} lit={false} />;
  if (plans) { const minutes = trial?.ms === null || trial?.ms === undefined ? null : Math.max(1, Math.round(trial.ms / 60000)); const prefix = state?.variant !== 'trial_out' && !trial?.over && state?.variant !== 'no_trial' && minutes !== null ? `${t('About {n} min left.').replace('{n}', String(minutes))} ` : ''; return <GuideTip anchor='[data-guide="nav-plans"]' width={290} dx={60} stepId="plans" title={t(trialTitle(state, trial?.ms ?? null, !!trial?.over))} body={`${prefix}${t('Pick a plan on the right to keep Natively Pro. Or use your own AI keys, free.')}`} action={{ label: t('Use my own keys'), onClick: () => dispatch({ type: 'own_keys' }) }} done={justDone} onSkip={skip} />; }
  if (keys) { const current = !checks.ai ? 'ai' : !checks.stt ? 'stt' : !checks.retrieval ? 'retrieval' : null; const row = (id: 'ai' | 'stt' | 'retrieval', label: string, hint: string): [string, 'done' | 'now' | 'todo', string | undefined] => [label, checks[id] ? 'done' : current === id ? 'now' : 'todo', checks[id] ? undefined : hint]; return <GuideTip anchor='[data-guide="nav-ai-providers"]' width={320} dx={60} stepId="keys" title={t('Set up Natively your way.')} body={t('An AI provider is all you need. Speech-to-text and retrieval make it better.')} list={[row('ai', t('AI provider'), t('Paste a key')), row('stt', t('Speech-to-text'), t('Pick one')), row('retrieval', t('Retrieval'), t('Optional'))]} action={{ label: t('Done'), onClick: () => dispatch({ type: 'keys_done' }), disabled: !checks.ai }} done={justDone} onSkip={skip} />; }
  return null;
}
