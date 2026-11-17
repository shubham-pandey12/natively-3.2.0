import React from 'react';
import { AppWindow, Camera, Check, Pencil, PointerOff } from 'lucide-react';
import { useT } from '../../i18n';
import { OverlayBanner, OverlayBannerButton } from '../ui/OverlayBanner';
import { GUIDE_STEP_NUMBERS, GUIDE_STEP_TOTAL, useRecoveredGuide, useGuideHighlight } from '../onboarding/useRecoveredGuide';
import '../onboarding/RecoveredGuide.css';

const DEMO_URL = 'https://youtu.be/Ha_ZiwG5Kwc';

function guideKeys(accelerator: string): string[] {
  const raw = String(window.electronAPI?.platform ?? navigator.platform?.toLowerCase() ?? '');
  const mac = raw === 'darwin' || raw.startsWith('mac');
  const names: Record<string, string> = mac
    ? { commandorcontrol: '⌘', cmdorctrl: '⌘', command: '⌘', cmd: '⌘', meta: '⌘', super: '⌘', control: '⌃', ctrl: '⌃', alt: '⌥', option: '⌥', shift: '⇧' }
    : { commandorcontrol: 'Ctrl', cmdorctrl: 'Ctrl', control: 'Ctrl', ctrl: 'Ctrl', command: 'Win', cmd: 'Win', meta: 'Win', super: 'Win', alt: 'Alt', option: 'Alt', shift: 'Shift' };
  return String(accelerator || '').split('+').map(part => part.trim()).filter(Boolean).map(part => names[part.toLowerCase()] ?? (part.length === 1 ? part.toUpperCase() : part));
}

export function useOverlayFirstRunGuide(whatToAnswer: () => void) {
  const t = useT();
  const { state, justDone, dispatch: send } = useRecoveredGuide();
  const dispatch = React.useCallback((type: string) => send({ type }), [send]);
  const step = state?.status === 'active' ? state.step : null;
  const needsKeys = step === 'answer' || step === 'screenshot';
  const [keybinds, setKeybinds] = React.useState<Array<{ id: string; accelerator: string }> | null>(null);
  React.useEffect(() => {
    if (!needsKeys) return;
    let active = true;
    window.electronAPI?.getKeybinds?.().then(value => { if (active) setKeybinds(value); }).catch(() => {});
    const off = window.electronAPI?.onKeybindsUpdate?.(value => setKeybinds(value));
    return () => { active = false; off?.(); };
  }, [needsKeys]);
  const keys = React.useCallback((id: string, fallback: string) => guideKeys(keybinds?.find(key => key.id === id)?.accelerator || fallback), [keybinds]);
  useGuideHighlight(step === 'answer' && !justDone ? '[data-guide="what-to-answer"]' : null);
  const [heardSpeech, setHeardSpeech] = React.useState(false);
  const [firstSpeechAt, setFirstSpeechAt] = React.useState<number | null>(null);
  const watching = step === 'overlay' || step === 'answer';
  React.useEffect(() => {
    if (!watching || heardSpeech) return;
    return window.electronAPI?.onNativeAudioTranscript?.(turn => { if (turn?.text?.trim()) { setHeardSpeech(true); setFirstSpeechAt(Date.now()); } });
  }, [watching, heardSpeech]);
  const noSoundAt = typeof state?.stopLockUntil === 'number' ? state.stopLockUntil - 30_000 : null;
  const [noSound, setNoSound] = React.useState(false);
  React.useEffect(() => {
    setNoSound(false);
    if (!watching || heardSpeech || noSoundAt === null) return;
    const timer = setTimeout(() => setNoSound(true), Math.max(0, noSoundAt + 8_000 - Date.now()));
    return () => clearTimeout(timer);
  }, [watching, heardSpeech, noSoundAt]);
  const whatToAnswerRef = React.useRef(whatToAnswer);
  whatToAnswerRef.current = whatToAnswer;
  const [autoReady, setAutoReady] = React.useState(false);
  const autoSent = React.useRef(false);
  React.useEffect(() => {
    if (noSoundAt === null || firstSpeechAt === null || autoReady || autoSent.current) return;
    const timer = setTimeout(() => setAutoReady(true), Math.max(0, firstSpeechAt + 15_000 - Date.now()));
    return () => clearTimeout(timer);
  }, [noSoundAt, firstSpeechAt, autoReady]);
  React.useEffect(() => {
    if (!autoReady || autoSent.current || justDone) return;
    if (step === 'overlay') dispatch('overlay_next');
    else if (step === 'answer') { autoSent.current = true; whatToAnswerRef.current(); }
  }, [autoReady, step, justDone, dispatch]);
  React.useEffect(() => {
    if (step !== 'answer' || justDone) return;
    const done = () => dispatch('answer_shown');
    const offSuggested = window.electronAPI?.onIntelligenceSuggestedAnswer?.(done);
    const offManual = window.electronAPI?.onIntelligenceManualResult?.(done);
    return () => { offSuggested?.(); offManual?.(); };
  }, [step, justDone, dispatch]);
  const demo = <OverlayBannerButton variant="secondary" onClick={() => { window.electronAPI?.openExternal?.(DEMO_URL); }}>{t('Open the demo')}</OverlayBannerButton>;
  const keycaps = (value: string[]) => <span className="ov-banner-keys">{value.map((key, index) => <kbd key={index}>{key}</kbd>)}</span>;
  const banner = (id: string, icon: React.ReactNode, title: string, message: React.ReactNode, actions?: React.ReactNode) => {
    const count = t('{n} of {total}').replace('{n}', String(GUIDE_STEP_NUMBERS[id])).replace('{total}', String(GUIDE_STEP_TOTAL));
    return <OverlayBanner className="mx-4" data-guide-strip={id} tone={justDone ? 'ok' : 'guide'} icon={justDone ? <Check strokeWidth={2.4} /> : icon} title={title} message={message} actions={<>{!justDone && actions}<span className="guide-count" aria-label={count}>{count}</span></>} onDismiss={justDone ? undefined : () => dispatch('skip')} dismissLabel={t('Skip guide')} />;
  };
  if (step === 'overlay') return { wants: true, node: banner('overlay', <AppWindow strokeWidth={2.2} />, t('This is your meeting overlay.'), t(noSound && !heardSpeech ? 'No sound yet? Press play on the Natively demo in your browser.' : 'Answers, screenshots and chat show up here, over your call.'), <>{noSound && !heardSpeech && demo}<OverlayBannerButton variant="primary" onClick={() => dispatch('overlay_next')}>{t('Next')}</OverlayBannerButton></>) };
  if (step === 'answer') return { wants: true, node: banner('answer', <Pencil strokeWidth={2.2} />, t('They just asked you something.'), t(heardSpeech ? 'Press the keys. Natively writes your reply from the conversation.' : noSound && !heardSpeech ? 'No sound yet? Press play on the Natively demo in your browser.' : 'Not on a call? Play any interview video, or ask a question out loud.'), <>{noSound && !heardSpeech && demo}{keycaps(keys('chat:whatToAnswer', 'CommandOrControl+1'))}</>) };
  if (step === 'screenshot') return { wants: true, node: banner('screenshot', <Camera strokeWidth={2.2} />, t('Show Natively your screen.'), <span className="guide-key-row"><span>{keycaps(keys('general:take-screenshot', 'CommandOrControl+H'))} {t('Whole screen')}</span><span>{keycaps(keys('general:selective-screenshot', 'CommandOrControl+Shift+H'))} {t('Drag an area')}</span></span>) };
  if (step === 'stop') return { wants: true, node: banner('stop', <PointerOff strokeWidth={2.2} />, t('Stop the meeting when you’re ready.'), t('Press the stop button ■ in the bar at the top. Natively writes up your notes.')) };
  return { wants: false, node: null };
}
