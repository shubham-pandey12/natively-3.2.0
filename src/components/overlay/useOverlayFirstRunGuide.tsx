import React from 'react';
import { AppWindow, Camera, Check, Pencil, PointerOff } from 'lucide-react';
import { useT } from '../../i18n';
import { DEMO_VIDEO_URL, GUIDE_AUTO_ANSWER_DELAY_MS, GUIDE_SILENT_DEMO_DELAY_MS } from '../../lib/demoVideoUrl';
import { OverlayBanner, OverlayBannerButton } from '../ui/OverlayBanner';
import {
  GUIDE_STEP_NUMBER,
  GUIDE_STEP_TOTAL,
  GUIDE_STOP_LOCK_MS,
  isGuideStep,
  useGuideHighlight,
  useGuideShortcuts,
  useRecoveredGuide,
} from '../onboarding/useRecoveredGuide';
import '../onboarding/RecoveredGuide.css';

function Keycaps({ keys }: { keys: string[] }) {
  return (
    <span className="ov-banner-keys">
      {keys.map((key, index) => (
        <kbd key={index}>{key}</kbd>
      ))}
    </span>
  );
}

export function useOverlayFirstRunGuide(opts: { whatToAnswer?: () => void } = {}) {
  const t = useT();
  const { state, justDone, dispatch } = useRecoveredGuide();
  const step = state?.status === 'active' ? state.step : null;
  const shortcutFor = useGuideShortcuts(step === 'answer' || step === 'screenshot');
  useGuideHighlight(step === 'answer' && !justDone ? '[data-guide="what-to-answer"]' : null);

  const watching = step === 'overlay' || step === 'answer';
  const [heardSpeech, setHeardSpeech] = React.useState(false);
  const [firstSpeechAt, setFirstSpeechAt] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!watching || heardSpeech) return;
    const off = window.electronAPI?.onNativeAudioTranscript?.((turn) => {
      if (turn?.text?.trim()) {
        setHeardSpeech(true);
        setFirstSpeechAt(Date.now());
      }
    });
    return () => {
      off?.();
    };
  }, [watching, heardSpeech]);

  const noSoundAt = typeof state?.stopLockUntil === 'number' ? state.stopLockUntil - GUIDE_STOP_LOCK_MS : null;
  const [noSoundTimerDone, setNoSoundTimerDone] = React.useState(false);
  React.useEffect(() => {
    setNoSoundTimerDone(false);
    if (!watching || heardSpeech || noSoundAt === null) return;
    const timer = setTimeout(() => setNoSoundTimerDone(true), Math.max(0, noSoundAt + GUIDE_SILENT_DEMO_DELAY_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [watching, heardSpeech, noSoundAt]);

  const noSound = noSoundTimerDone && !heardSpeech;
  const whatToAnswerRef = React.useRef(opts.whatToAnswer);
  whatToAnswerRef.current = opts.whatToAnswer;
  const [autoReady, setAutoReady] = React.useState(false);
  const autoSent = React.useRef(false);
  React.useEffect(() => {
    if (noSoundAt === null || firstSpeechAt === null || autoReady || autoSent.current) return;
    const timer = setTimeout(() => setAutoReady(true), Math.max(0, firstSpeechAt + GUIDE_AUTO_ANSWER_DELAY_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [noSoundAt, firstSpeechAt, autoReady]);

  React.useEffect(() => {
    if (!autoReady || autoSent.current || justDone) return;
    if (step === 'overlay') {
      dispatch({ type: 'overlay_next' });
      return;
    }
    if (step === 'answer') {
      autoSent.current = true;
      whatToAnswerRef.current?.();
    }
  }, [autoReady, step, justDone, dispatch]);

  const demo = (
    <OverlayBannerButton
      variant="secondary"
      onClick={() => {
        window.electronAPI?.openExternal?.(DEMO_VIDEO_URL);
      }}
    >
      {t('Open the demo')}
    </OverlayBannerButton>
  );

  React.useEffect(() => {
    if (step !== 'answer' || justDone) return;
    const done = () => dispatch({ type: 'answer_shown' });
    const offs = [
      window.electronAPI?.onIntelligenceSuggestedAnswer?.(done),
      window.electronAPI?.onIntelligenceManualResult?.(done),
    ];
    return () => {
      offs.forEach((off) => off?.());
    };
  }, [step, justDone, dispatch]);

  const banner = (id: string, icon: React.ReactNode, title: string, message: React.ReactNode, actions?: React.ReactNode) => {
    const done = !!justDone;
    const count = t('{n} of {total}')
      .replace('{n}', String(GUIDE_STEP_NUMBER[id]))
      .replace('{total}', String(GUIDE_STEP_TOTAL));
    return (
      <OverlayBanner
        className="mx-4"
        data-guide-strip={id}
        tone={done ? 'ok' : 'guide'}
        icon={done ? <Check strokeWidth={2.4} /> : icon}
        title={title}
        message={message}
        actions={
          <>
            {!done && actions}
            <span className="guide-count" aria-label={count}>
              {count}
            </span>
          </>
        }
        onDismiss={done ? undefined : () => dispatch({ type: 'skip' })}
        dismissLabel={t('Skip guide')}
      />
    );
  };

  if (isGuideStep(state, 'overlay')) {
    return {
      wants: true,
      node: banner(
        'overlay',
        <AppWindow strokeWidth={2.2} />,
        t('This is your meeting overlay.'),
        t(
          noSound
            ? 'No sound yet? Press play on the Natively demo in your browser.'
            : 'Answers, screenshots and chat show up here, over your call.',
        ),
        <>
          {noSound && demo}
          <OverlayBannerButton variant="primary" onClick={() => dispatch({ type: 'overlay_next' })}>
            {t('Next')}
          </OverlayBannerButton>
        </>,
      ),
    };
  }
  if (isGuideStep(state, 'answer')) {
    return {
      wants: true,
      node: banner(
        'answer',
        <Pencil strokeWidth={2.2} />,
        t('They just asked you something.'),
        t(
          heardSpeech
            ? 'Press the keys. Natively writes your reply from the conversation.'
            : noSound
              ? 'No sound yet? Press play on the Natively demo in your browser.'
              : 'Not on a call? Play any interview video, or ask a question out loud.',
        ),
        <>
          {noSound && demo}
          <Keycaps keys={shortcutFor('chat:whatToAnswer')} />
        </>,
      ),
    };
  }
  if (isGuideStep(state, 'screenshot')) {
    return {
      wants: true,
      node: banner(
        'screenshot',
        <Camera strokeWidth={2.2} />,
        t('Show Natively your screen.'),
        <span className="guide-key-row">
          <span>
            <Keycaps keys={shortcutFor('general:take-screenshot')} /> {t('Whole screen')}
          </span>
          <span>
            <Keycaps keys={shortcutFor('general:selective-screenshot')} /> {t('Drag an area')}
          </span>
        </span>,
      ),
    };
  }
  if (isGuideStep(state, 'stop')) {
    return {
      wants: true,
      node: banner(
        'stop',
        <PointerOff strokeWidth={2.2} />,
        t('Stop the meeting when you’re ready.'),
        t('Press the stop button ■ in the bar at the top. Natively writes up your notes.'),
      ),
    };
  }
  return { wants: false, node: null };
}
