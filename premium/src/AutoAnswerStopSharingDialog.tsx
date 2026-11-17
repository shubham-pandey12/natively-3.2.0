// Confirm before stopping Auto Answer transcript sharing.
// Ported 1:1 from recovered Natively 3.2.0 (premium/src/AutoAnswerStopSharingDialog.tsx).
import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { useT } from '../../src/i18n';
import { useResolvedTheme } from '../../src/hooks/useResolvedTheme';
import { GenieModal } from '../../src/components/ui/GenieModal';
import {
  CloseButton, CtaButton, Eyebrow, FactList, FactRow, FONT, INK_DARK, INK_LIGHT, Lede, SwapLabel, TextButton, Title,
  bodyMotion, bodyStyle, genieDialogProps,
} from './autoAnswerDialogKit';

const TRAINING_PRIVACY_URL = 'https://heynatively.com/privacy#3-7-auto-answer-training';

export interface AutoAnswerStopSharingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStop: () => void;
  onUpgrade?: () => void;
  freeBySharing: boolean;
  busy?: boolean;
}

export const AutoAnswerStopSharingDialog: React.FC<AutoAnswerStopSharingDialogProps> = ({ open, onOpenChange, onStop, onUpgrade, freeBySharing, busy = false }) => {
  const t = useT();
  const reduced = useReducedMotion() ?? false;
  const isLight = useResolvedTheme() === 'light';
  const ink = isLight ? INK_LIGHT : INK_DARK;
  const [leaning, setLeaning] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const close = () => { if (!busy) onOpenChange(false); };
  useEffect(() => {
    if (!open) { setLeaning(false); return; }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    const focus = window.setTimeout(() => keepRef.current?.focus({ preventScroll: true }), 60);
    return () => { window.removeEventListener('keydown', onKey, true); window.clearTimeout(focus); };
  }, [open, busy]);

  const danger = isLight
    ? { rest: 'rgba(176,42,42,0.72)', hot: 'rgba(176,42,42,1)' }
    : { rest: 'rgba(255,128,118,0.70)', hot: 'rgba(255,140,130,1)' };
  const ifYouStop = t(freeBySharing
    ? 'Auto Answer stops working. Nothing more is sent, and transcripts not yet sent are deleted from this computer.'
    : 'Nothing more is sent, and transcripts not yet sent are deleted from this computer. Auto Answer keeps working with Pro.');
  const second = freeBySharing
    ? { label: t('To keep it'), text: t('Keep sharing, or get Natively Pro.') }
    : { label: t('Why it helps'), text: t('Real meetings are how it learns when to answer and when to wait.') };

  return (
    <GenieModal
      open={open}
      label="AutoAnswerStopSharingDialog"
      onBackdropClick={close}
      {...genieDialogProps(isLight)}
      cardProps={{ role: 'alertdialog', 'aria-modal': true, 'aria-labelledby': 'auto-answer-stop-title', 'aria-describedby': 'auto-answer-stop-desc' }}
    >
      <motion.div style={bodyStyle} {...bodyMotion(reduced)}>
        <CloseButton ink={ink} reduced={reduced} label={t('Keep sharing')} disabled={busy} onClick={close} />
        <Eyebrow ink={ink}>{t('Auto Answer · sharing')}</Eyebrow>
        <Title ink={ink} id="auto-answer-stop-title">{t(freeBySharing ? 'Keep Auto Answer free?' : 'Keep helping it learn?')}</Title>
        <Lede ink={ink} id="auto-answer-stop-desc">{t(freeBySharing
          ? 'Auto Answer is free for you because you share the transcripts of meetings where it runs.'
          : 'The transcripts you share teach Auto Answer when to answer and when to wait.')}</Lede>
        <FactList>
          <FactRow ink={ink} label={t('If you stop')} reduced={reduced} lit={leaning || busy} litColor={danger.hot}>{ifYouStop}</FactRow>
          <FactRow ink={ink} label={second.label} reduced={reduced}>{second.text}</FactRow>
        </FactList>
        <div style={{ marginTop: 'auto', paddingTop: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            <CtaButton ref={keepRef} ink={ink} isLight={isLight} reduced={reduced} disabled={busy} arrow={false} onClick={close}>{t('Keep sharing')}</CtaButton>
            {freeBySharing && onUpgrade && <TextButton ink={ink} reduced={reduced} disabled={busy} onClick={onUpgrade}>{t('See Pro plans')}</TextButton>}
            <TextButton
              ink={ink} reduced={reduced} disabled={busy} onClick={onStop} onLean={setLeaning} tone={danger} size={12.5}
              style={{ marginLeft: 'auto', display: 'inline-flex', justifyContent: 'flex-end', minWidth: '96px' }}
            >
              <SwapLabel id={busy ? 'busy' : 'idle'} reduced={reduced}>
                {busy ? <><Loader2 size={13} strokeWidth={2} className="animate-spin" aria-hidden />{t('Stopping…')}</> : t('Stop sharing')}
              </SwapLabel>
            </TextButton>
          </div>
          <div style={{ marginTop: '14px' }}>
            <button
              type="button"
              onClick={() => { window.electronAPI?.openExternal?.(TRAINING_PRIVACY_URL); }}
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: '11.5px', fontWeight: 500, color: ink.faint, display: 'inline-flex', alignItems: 'center', gap: '2px' }}
            >
              {t('Privacy Policy §3.7')}
              <ArrowUpRight size={12} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      </motion.div>
    </GenieModal>
  );
};

export default AutoAnswerStopSharingDialog;
