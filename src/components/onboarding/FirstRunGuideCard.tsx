import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { openDemoVideo } from '../../lib/demoVideo';
import { guideShortcutLabel } from '../../lib/guideShortcutLabel';
import { isMac } from '../../utils/platformUtils';
import { useT } from '../../i18n';
import './RecoveredGuide.css';

type GuideState = { status: string; step: string; stopLockUntil?: number | null };
type GuideApi = {
  guideGet?: () => Promise<GuideState>;
  guideDispatch?: (event: { type: string; [key: string]: unknown }) => Promise<GuideState>;
  onGuideChanged?: (cb: (state: GuideState) => void) => () => void;
};

const steps: Record<string, [string, string, string | null]> = {
  start: ['Start your first meeting.', 'Your free trial covers it. Start now: the Natively demo plays in your browser so you can watch it work.', null],
  overlay: ['This is your meeting overlay.', 'Answers, screenshots and chat show up here, over your call.', 'overlay_next'],
  answer: ['They just asked you something.', 'Not on a call? Play any interview video, or ask a question out loud.', null],
  screenshot: ['Show Natively your screen.', 'Whole screen or drag an area.', null],
  stop: ['Stop the meeting when you’re ready.', 'Press the stop button ■ in the bar at the top. Natively writes up your notes.', null],
  notes: ['Your meeting, written up.', 'The summary and the full transcript are saved here. Find them any time on Home.', 'notes_next'],
  surface: ['Now try the notepad.', 'Pick Notepad. Your next meeting opens there: write while you talk, and Ask with recipes.', null],
  start2: ['Start Natively again.', 'This time your meeting opens in the notepad.', null],
  notepad: ['Keep a note', 'Write down what matters during your meeting.', null],
  ask: ['Ask a question', 'Ask Natively about the conversation.', null],
  recipe: ['Try a recipe', 'Use a recipe for a common question.', null],
  stop2: ['Finish this meeting', 'Stop to save your work.', null],
  notes2: ['Read your notes', 'Open the notes from your meeting.', 'notes_next'],
  plans: ['Keep Natively Pro after your trial.', 'Pick a plan on the right to keep Natively Pro. Or use your own AI keys, free.', null],
  keys: ['Set up Natively your way.', 'An AI provider is all you need. Speech-to-text and retrieval make it better.', null],
};

export function FirstRunGuideCard({ surface }: { surface: 'launcher' | 'overlay' | 'notepad' }) {
  const t = useT();
  const api = window.electronAPI as GuideApi;
  const [guide, setGuide] = useState<GuideState | null>(null);
  const [heardSpeech, setHeardSpeech] = useState(false);
  const [firstSpeechAt, setFirstSpeechAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [guideStepStarted, setGuideStepStarted] = useState(Date.now());
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [anchorMissingSince, setAnchorMissingSince] = useState<number | null>(null);
  const [keys, setKeys] = useState({ ai: false, stt: false, retrieval: false });
  const getGuide = api?.guideGet;
  const dispatchGuide = api?.guideDispatch;
  useEffect(() => {
    if (!getGuide) return;
    void getGuide.call(api).then(setGuide).catch(() => {});
    return api.onGuideChanged?.(setGuide);
  }, []);
  useEffect(() => {
    if (surface !== 'overlay' || guide?.step !== 'answer') return;
    const done = () => { void dispatchGuide?.call(api, { type: 'answer_shown' }).then(setGuide).catch(() => {}); };
    const offSuggested = window.electronAPI?.onIntelligenceSuggestedAnswer?.(done);
    const offManual = window.electronAPI?.onIntelligenceManualResult?.(done);
    return () => { offSuggested?.(); offManual?.(); };
  }, [surface, guide?.step]);
  useEffect(() => {
    if (surface !== 'launcher' || guide?.status !== 'active') return;
    const selector = guide.step === 'surface' ? '[data-guide="surface-switch"]' : guide.step === 'plans' ? '[data-guide="nav-plans"]' : guide.step === 'keys' ? '[data-guide="nav-ai-providers"]' : guide.step === 'start' || guide.step === 'start2' ? '[data-guide="start"]' : null;
    const target = selector ? document.querySelector(selector) : null;
    target?.classList.add('animate-pulse');
    return () => target?.classList.remove('animate-pulse');
  }, [surface, guide?.status, guide?.step]);
  useEffect(() => {
    if (surface !== 'overlay' || !['overlay', 'answer'].includes(guide?.step ?? '')) return;
    return window.electronAPI?.onNativeAudioTranscript?.(turn => { if (turn.text.trim()) { setHeardSpeech(true); setFirstSpeechAt(value => value ?? Date.now()); } });
  }, [surface, guide?.step]);
  useEffect(() => {
    if (!firstSpeechAt || surface !== 'overlay' || guide?.step !== 'overlay') return;
    const timer = window.setTimeout(() => { void dispatchGuide?.call(api, { type: 'overlay_next' }).then(setGuide).catch(() => {}); }, Math.max(0, firstSpeechAt + 15_000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [firstSpeechAt, surface, guide?.step]);
  useEffect(() => {
    setGuideStepStarted(Date.now());
  }, [guide?.step]);
  useEffect(() => {
    if (surface !== 'launcher' || !['start', 'start2', 'surface', 'plans', 'keys'].includes(guide?.step ?? '')) return;
    const selector = guide?.step === 'start' || guide?.step === 'start2' ? '[data-guide="start"]' : guide?.step === 'surface' ? '[data-guide="surface-switch"]' : guide?.step === 'plans' ? '[data-guide="nav-plans"]' : '[data-guide="nav-ai-providers"]';
    const update = () => {
      const found = document.querySelector(selector)?.getBoundingClientRect() ?? null;
      setAnchor(found);
      setAnchorMissingSince(value => found ? null : value ?? Date.now());
    };
    update();
    window.addEventListener('resize', update);
    const timer = window.setInterval(update, 500);
    return () => { window.removeEventListener('resize', update); window.clearInterval(timer); };
  }, [surface, guide?.step]);
  useEffect(() => {
    if (guide?.step !== 'plans') return;
    const changed = () => send('plan_changed');
    changed();
    const offLicense = window.electronAPI?.onLicenseStatusChanged?.(changed);
    const offCredentials = window.electronAPI?.onCredentialsChanged?.(changed);
    void window.electronAPI?.getTrialStatus?.().then(trial => {
      if (trial?.expired || trial?.remaining_ms === 0) send('trial_out');
    }).catch(() => {});
    return () => { offLicense?.(); offCredentials?.(); };
  }, [guide?.step]);
  useEffect(() => {
    if (guide?.step !== 'keys') return;
    const update = () => {
      void Promise.all([window.electronAPI?.getStoredCredentials?.(), window.electronAPI?.getSttProvider?.(), window.electronAPI?.getEmbeddingStatus?.()]).then(([credentials, stt, retrieval]) => setKeys({
        ai: !!credentials?.hasOwnAiKey,
        stt: !!stt && stt !== 'none' && stt !== 'natively',
        retrieval: !!retrieval?.active?.configured,
      })).catch(() => {});
    };
    update();
    const timer = window.setInterval(update, 4000);
    return () => window.clearInterval(timer);
  }, [guide?.step]);
  useEffect(() => {
    if (guide?.status !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [guide?.status, guide?.step]);
  if (guide?.status !== 'active' || (surface === 'overlay' && !['overlay', 'answer', 'screenshot', 'stop'].includes(guide.step)) || (surface === 'notepad' && !['notepad', 'ask', 'recipe', 'stop2'].includes(guide.step)) || (surface === 'launcher' && !['start', 'notes', 'surface', 'start2', 'notes2', 'plans', 'keys'].includes(guide.step))) return null;
  const [title, body, next] = steps[guide.step] ?? steps.start;
  const send = (type: string) => { void dispatchGuide?.call(api, { type }).then(setGuide).catch(() => {}); };
  if (surface === 'launcher' && anchorMissingSince && now - anchorMissingSince > 1500 && ['start', 'start2', 'surface', 'plans', 'keys'].includes(guide.step)) {
    return createPortal(<div data-guide-card="continue" className="fixed bottom-5 left-1/2 z-[2147483001] -translate-x-1/2 rounded-full bg-slate-950 p-2 text-white shadow-xl"><button type="button" className="px-3" onClick={() => send('skip')}>{t('Skip guide')}</button><button type="button" className="rounded-full bg-blue-600 px-4 py-2" onClick={() => { void window.electronAPI?.openSettingsTab?.(guide.step === 'surface' ? 'overlay' : guide.step === 'keys' ? 'ai-providers' : 'plans'); }}>{t('Continue the guide')}</button></div>, document.body);
  }
  const stepNumber = { start: 1, overlay: 2, answer: 3, screenshot: 4, stop: 5, notes: 6, surface: 7, start2: 8, notepad: 9, ask: 10, recipe: 11, stop2: 12, notes2: 13, plans: 14, keys: 14 }[guide.step as keyof typeof steps];
  const count = t('{n} of {total}').replace('{n}', String(stepNumber ?? 1)).replace('{total}', '14');
  const card = <aside data-guide-card={guide.step} data-guide-strip={surface === 'overlay' ? guide.step : undefined} data-tone={surface === 'overlay' ? 'guide' : undefined} role={surface === 'launcher' ? 'dialog' : 'status'} aria-label={t(title)} className={surface === 'launcher' ? 'guide-enter guide-tip' : 'ov-banner guide-strip'} style={surface === 'launcher' && anchor ? { position: 'fixed', zIndex: 2147483001, width: 320, left: Math.max(12, Math.min(window.innerWidth - 332, anchor.left + anchor.width / 2 - 160)), top: anchor.bottom + 18 } : { position: 'absolute', zIndex: 100, top: 12, left: 12, right: 12 }}>
    {surface === 'launcher' && anchor && <span className="guide-tip-arrow" style={{ left: Math.max(22, Math.min(298, anchor.left + anchor.width / 2 - Math.max(12, Math.min(window.innerWidth - 332, anchor.left + anchor.width / 2 - 160)) - 9)) }} aria-hidden="true" />}
    <div className="guide-tip-shell"><span className="guide-glass" aria-hidden="true"><span className="guide-glass-frost" /></span><div className="guide-tip-inner">
    <div className="flex items-start justify-between gap-2"><strong className="guide-tip-title">{t(title)}</strong><button type="button" className="guide-tip-close" aria-label={t('Skip guide')} onClick={() => send('skip')}>×</button></div>
    <p className="guide-tip-body">{t(body)}</p>
    {surface === 'overlay' && !heardSpeech && ['overlay', 'answer'].includes(guide.step) && now - guideStepStarted >= 8_000 && <p className="mt-1 text-xs">No sound yet? Press play on the Natively demo in your browser. <button type="button" className="underline" onClick={() => { void openDemoVideo(); }}>Open the demo</button></p>}
    {surface === 'overlay' && guide.step === 'answer' && <p className="mt-1 text-xs">{t('Press the keys. Natively writes your reply from the conversation.')} {guideShortcutLabel(isMac ? 'darwin' : 'win32', 'H')}</p>}
    {surface === 'overlay' && guide.step === 'screenshot' && <p className="mt-1 text-xs">{t('Whole screen')} · {t('Drag an area')}</p>}
    {/* Main refuses end-meeting while the stop lock runs: say so, never a silent no-op. */}
    {surface === 'overlay' && typeof guide.stopLockUntil === 'number' && guide.stopLockUntil > now && <p className="mt-1 text-xs opacity-80" data-guide-stop-lock>Stop unlocks in {Math.ceil((guide.stopLockUntil - now) / 1000)} s</p>}
    {next && <button type="button" className="mt-2 rounded-lg bg-blue-600 px-3 py-1 text-sm" onClick={() => send(next)}>{t('Next')}</button>}
    {guide.step === 'plans' && <button type="button" className="mt-2 ml-2 text-sm underline" onClick={() => send('own_keys')}>{t('Use my own keys')}</button>}
    {guide.step === 'keys' && <><ul className="mt-2 text-sm" aria-label={t('Setup checklist')}><li>{keys.ai ? '✓' : '○'} {t('AI provider')} — {t(keys.ai ? 'Done' : 'Paste a key')}</li><li>{keys.stt ? '✓' : '○'} {t('Speech-to-text')} — {t(keys.stt ? 'Done' : 'Pick one')}</li><li>{keys.retrieval ? '✓' : '○'} {t('Retrieval')} — {t(keys.retrieval ? 'Done' : 'Optional')}</li></ul><button type="button" className="mt-2 text-sm underline" onClick={() => { void window.electronAPI?.openSettingsTab?.('ai-providers'); }}>{t('AI Providers')}</button><button type="button" className="ml-2 text-sm underline" disabled={!keys.ai} onClick={() => send('keys_done')}>{t('Done')}</button></>}
    <div className="guide-tip-foot"><span className="guide-tip-count" aria-label={count}>{count}</span></div>
    </div></div>
  </aside>;
  return surface === 'launcher' && anchor ? createPortal(card, document.body) : card;
}
