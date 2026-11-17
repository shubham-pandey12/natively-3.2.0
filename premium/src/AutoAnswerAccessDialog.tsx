// Auto Answer access dialog: Natively Pro, or free with transcript sharing.
// Ported 1:1 from recovered Natively 3.2.0 (premium/src/AutoAnswerAccessDialog.tsx).
import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useT } from '../../src/i18n';
import { useResolvedTheme } from '../../src/hooks/useResolvedTheme';
import { GenieModal } from '../../src/components/ui/GenieModal';
import {
  CloseButton, CtaButton, Eyebrow, FactList, FactRow, FONT, INK_DARK, INK_LIGHT, Lede, TextButton, Title,
  bodyMotion, bodyStyle, genieDialogProps,
} from './autoAnswerDialogKit';

const TRAINING_PRIVACY_URL = 'https://heynatively.com/privacy#3-7-auto-answer-training';
const PRIVACY_URL = 'https://heynatively.com/privacy';

export interface AutoAnswerAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShare: () => void;
  onUpgrade: () => void;
  busy?: boolean;
  proOptIn?: boolean;
  intro?: boolean;
  onTurnOn?: () => void;
  sharingOn?: boolean;
}

export const AutoAnswerAccessDialog: React.FC<AutoAnswerAccessDialogProps> = ({ open, onOpenChange, onShare, onUpgrade, busy = false, proOptIn = false, intro = false, onTurnOn, sharingOn = false }) => {
  const t = useT();
  const reduced = useReducedMotion() ?? false;
  const isLight = useResolvedTheme() === 'light';
  const ink = isLight ? INK_LIGHT : INK_DARK;
  const [leaning, setLeaning] = useState(false);
  const close = () => { if (!busy) onOpenChange(false); };
  useEffect(() => {
    if (!open) { setLeaning(false); return; }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, busy]);

  const introFacts = [
    { label: t('How it decides'), text: t('The on-device model decides most moments on this computer, once you download it. The rest go to the AI judge.') },
    { label: t('Sent'), text: t('The last few lines of the conversation go to the AI you chose in AI Providers (or Natively API) to decide and to write the answer, as when you ask for an answer yourself.') },
    { label: t('Beta'), text: t('It can answer when no one asked you anything, or miss a question. Read an answer before you use it.') },
    { label: t('Your part'), text: t('Telling the other people in the meeting that it is transcribed, where the law requires it.') },
    { label: t('Sharing'), text: t(sharingOn
      ? 'On. The transcripts of meetings where Auto Answer runs are shared to improve it. Stop any time in Settings › Intelligence.'
      : 'Off. Sharing transcripts to improve Auto Answer is a separate choice in Settings › Intelligence.') },
  ];
  const sharingFacts = [
    { label: t('Sent'), text: t('The full transcript of each meeting where Auto Answer was on, including what other people said, with the meeting mode and length.') },
    { label: t('Removed first'), text: t('On your computer: e-mail addresses, phone numbers, links, long numbers, and the names Natively knows (yours, your calendar invitees\', the call\'s). Other names said aloud stay, so do not share meetings you are not allowed to share.') },
    { label: t('Never sent'), text: t('Audio, screenshots, your notes, AI answers, meeting titles and calendar events.') },
    { label: t('Used for'), text: t('Only training and testing Natively\'s Auto Answer models, with the services we use for that (Anthropic to label, Modal to train). Not sold, not used for ads. Kept at most 2 years.') },
    { label: t('Your part'), text: t('Telling the other people in the meeting, where the law requires it.') },
  ];
  const facts = intro ? introFacts : sharingFacts;
  const sentLabel = t('Sent');

  return (
    <GenieModal
      open={open}
      label="AutoAnswerAccessDialog"
      onBackdropClick={close}
      {...genieDialogProps(isLight)}
      cardProps={{ role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'auto-answer-access-title', 'aria-describedby': 'auto-answer-access-desc' }}
    >
      <motion.div style={bodyStyle} {...bodyMotion(reduced)}>
        <CloseButton ink={ink} reduced={reduced} label={t('Not now')} disabled={busy} onClick={close} />
        <Eyebrow ink={ink}>{t(intro ? 'Auto Answer · Beta' : proOptIn ? 'Auto Answer · optional' : 'Auto Answer · Natively Pro')}</Eyebrow>
        <Title ink={ink} id="auto-answer-access-title">{t(intro ? 'Before you turn it on.' : proOptIn ? 'Help it learn.' : 'Free, if you share.')}</Title>
        <Lede ink={ink} id="auto-answer-access-desc">{t(intro
          ? 'Auto Answer listens for questions asked of you and writes the answer as soon as the other person finishes, without you pressing anything.'
          : proOptIn
            ? 'Share the transcripts of meetings where Auto Answer runs, so it learns when to answer and when to wait.'
            : 'Auto Answer is part of Natively Pro. You can use it free by sharing the transcripts of meetings where it runs, so it learns when to answer and when to wait.')}</Lede>
        <FactList>
          {facts.map(({ label, text }) => (
            <FactRow key={label} ink={ink} label={label} reduced={reduced} lit={leaning && label === sentLabel}>{text}</FactRow>
          ))}
        </FactList>
        <div style={{ marginTop: 'auto', paddingTop: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'nowrap' }}>
            <CtaButton ink={ink} isLight={isLight} reduced={reduced} busy={busy} onClick={intro ? onTurnOn : onShare} onLean={setLeaning}>
              {t(intro ? 'Turn on Auto Answer' : proOptIn ? 'Share transcripts' : 'Share and turn on')}
            </CtaButton>
            {proOptIn || intro
              ? <TextButton ink={ink} reduced={reduced} disabled={busy} onClick={close}>{t('Not now')}</TextButton>
              : <TextButton ink={ink} reduced={reduced} disabled={busy} onClick={onUpgrade}>{t('See Pro plans')}</TextButton>}
          </div>
          <div style={{ marginTop: '14px', fontSize: '11.5px', fontWeight: 500, color: ink.faint, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: '8px', rowGap: '2px' }}>
            {!intro && <span>{t('Stop any time in Settings › Intelligence.')}</span>}
            <button
              type="button"
              onClick={() => { window.electronAPI?.openExternal?.(intro ? PRIVACY_URL : TRAINING_PRIVACY_URL); }}
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: '11.5px', fontWeight: 500, color: ink.body, display: 'inline-flex', alignItems: 'center', gap: '2px' }}
            >
              {t(intro ? 'Privacy Policy' : 'Privacy Policy §3.7')}
              <ArrowUpRight size={12} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      </motion.div>
    </GenieModal>
  );
};

export default AutoAnswerAccessDialog;
