// Shared parts of the Auto Answer access and stop-sharing dialogs.
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Loader2, X } from 'lucide-react';

export const DIALOG_LAYER = 400;
export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

export type Ink = { strong: string; body: string; quiet: string; faint: string };
export const INK_DARK: Ink = { strong: '#F2F2F4', body: 'rgba(255,255,255,0.66)', quiet: 'rgba(255,255,255,0.52)', faint: 'rgba(255,255,255,0.48)' };
export const INK_LIGHT: Ink = { strong: '#0B1020', body: 'rgba(11,16,32,0.68)', quiet: 'rgba(11,16,32,0.66)', faint: 'rgba(11,16,32,0.58)' };

const SHADOW_LIGHT = '0 30px 70px -28px rgba(16,24,40,0.40)';
const SHADOW_DARK = '0 40px 90px -30px rgba(0,0,0,0.85)';
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const ENTER_MS = 180;
export const EXIT_MS = 300;
const PRESS_MS = 120;

export function genieDialogProps(isLight: boolean) {
  return {
    zIndex: DIALOG_LAYER,
    keepPictures: false,
    backdropStyle: { background: isLight ? 'rgba(10,10,18,0.30)' : 'rgba(0,0,0,0.80)' },
    padding: 16,
    wrapStyle: { width: '600px', maxWidth: '100%' },
    cardStyle: {
      background: isLight ? '#F7F8FC' : '#1C1C1E',
      boxShadow: isLight
        ? 'inset 0 0 0 1px rgba(11,16,32,0.10), inset 0 1px 0 rgba(255,255,255,0.80), ' + SHADOW_LIGHT
        : 'inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.06), ' + SHADOW_DARK,
      fontFamily: FONT,
      WebkitFontSmoothing: 'antialiased',
    } as React.CSSProperties,
    shadow: isLight ? SHADOW_LIGHT : SHADOW_DARK,
    radius: 20,
  };
}

// 3.2.1: a fixed-height card that never scrolls itself; only the terms list
// (FactList) scrolls, so the actions below it always stay in view.
export const bodyStyle: React.CSSProperties = {
  position: 'relative', height: '474px', maxHeight: 'calc(100vh - 48px)', overflow: 'hidden',
  padding: '40px 40px 34px 40px', display: 'flex', flexDirection: 'column',
};
export const bodyMotion = (reduced: boolean) => ({
  initial: reduced ? { opacity: 0 } : (false as const),
  animate: { opacity: 1 },
  transition: { duration: 0.15 },
});

export const Eyebrow: React.FC<{ ink: Ink; children: React.ReactNode }> = ({ ink, children }) => (
  <div style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '-0.005em', color: ink.quiet, margin: '0 0 14px' }}>{children}</div>
);

export const Title: React.FC<{ ink: Ink; id: string; children: React.ReactNode }> = ({ ink, id, children }) => (
  <h2 id={id} style={{ fontSize: '34px', fontWeight: 300, letterSpacing: '-0.032em', lineHeight: 1.08, margin: 0, color: ink.strong, textWrap: 'balance' } as React.CSSProperties}>{children}</h2>
);

export const Lede: React.FC<{ ink: Ink; id: string; children: React.ReactNode }> = ({ ink, id, children }) => (
  <p id={id} style={{ margin: '12px 0 0', fontSize: '13.5px', lineHeight: 1.55, letterSpacing: '-0.008em', color: ink.body, maxWidth: '440px', textWrap: 'pretty' } as React.CSSProperties}>{children}</p>
);

export const FactRow: React.FC<{ ink: Ink; label: string; lit?: boolean; litColor?: string; reduced: boolean; children: React.ReactNode }> = ({ ink, label, lit = false, litColor, reduced, children }) => (
  <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', columnGap: '12px' }}>
    <span aria-hidden style={{
      position: 'absolute', left: '-14px', top: '2px', bottom: '2px', width: '2px', borderRadius: '2px',
      background: litColor ?? ink.strong,
      transform: lit ? 'scaleY(1)' : 'scaleY(0)', transformOrigin: 'top', opacity: lit ? 1 : 0,
      transition: reduced
        ? `opacity ${lit ? ENTER_MS : EXIT_MS}ms ${EASE}`
        : `transform ${lit ? 250 : 150}ms ${EASE}, opacity ${lit ? ENTER_MS : EXIT_MS}ms ${EASE}`,
    }} />
    <dt style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '-0.005em', lineHeight: 1.45, color: ink.strong }}>{label}</dt>
    <dd style={{ margin: 0, fontSize: '12px', lineHeight: 1.45, letterSpacing: '-0.004em', textWrap: 'pretty', color: lit ? ink.strong : ink.body, transition: `color ${lit ? ENTER_MS : EXIT_MS}ms ${EASE}` } as React.CSSProperties}>{children}</dd>
  </div>
);

// 3.2.1: the list scrolls inside the fixed card and fades whichever edge has
// more to read. The negative left margin plus matching padding keeps
// FactRow's highlight bar (left: -14px) inside the scroll box, where the
// overflow would otherwise clip it.
export const FactList: React.FC<{ label?: string; children: React.ReactNode }> = ({ label = 'Terms', children }) => {
  const list = useRef<HTMLDListElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const measure = useCallback(() => {
    const element = list.current;
    if (!element) return;
    const top = element.scrollTop > 1;
    const bottom = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    setEdges((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }));
  }, []);
  useLayoutEffect(() => {
    measure();
    const element = list.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  const mask = `linear-gradient(to bottom, ${edges.top ? 'transparent 0, #000 18px' : '#000 0'}, ${edges.bottom ? '#000 calc(100% - 26px), transparent 100%' : '#000 100%'})`;
  const scrollable = edges.top || edges.bottom;
  return (
    <dl
      ref={list}
      onScroll={measure}
      tabIndex={scrollable ? 0 : -1}
      role={scrollable ? 'region' : undefined}
      aria-label={scrollable ? label : undefined}
      style={{
        margin: '22px 0 0 -14px', padding: '0 4px 2px 14px', flex: '1 1 auto', minHeight: 0,
        overflowY: 'auto', overscrollBehavior: 'contain', outline: 'none',
        display: 'flex', flexDirection: 'column', gap: '9px',
        maskImage: mask, WebkitMaskImage: mask,
      }}
    >{children}</dl>
  );
};

export const SwapLabel: React.FC<{ id: string; reduced: boolean; children: React.ReactNode }> = ({ id, reduced, children }) => (
  <AnimatePresence mode="popLayout" initial={false}>
    <motion.span
      key={id}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(4px)', filter: 'blur(2px)' }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)' }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-4px)', filter: 'blur(2px)' }}
      transition={{ duration: 0.15, ease: 'easeInOut' }}
    >{children}</motion.span>
  </AnimatePresence>
);

export function useLean(onLean?: (active: boolean) => void) {
  const [active, setActive] = useState(false);
  const [pressed, setPressed] = useState(false);
  const lean = (v: boolean) => { setActive(v); onLean?.(v); };
  return {
    active,
    pressed,
    handlers: {
      onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') lean(true); },
      onPointerLeave: () => { lean(false); setPressed(false); },
      onPointerDown: () => setPressed(true),
      onPointerUp: () => setPressed(false),
      onFocus: (e: React.FocusEvent<HTMLElement>) => { if (e.currentTarget.matches(':focus-visible')) lean(true); },
      onBlur: () => lean(false),
    },
  };
}

export interface CtaButtonProps {
  ink: Ink; isLight: boolean; reduced: boolean; busy?: boolean; disabled?: boolean; arrow?: boolean;
  onClick?: () => void; onLean?: (active: boolean) => void; children: React.ReactNode;
}
export const CtaButton = React.forwardRef<HTMLButtonElement, CtaButtonProps>(({ ink, isLight, reduced, busy = false, disabled = false, arrow = true, onClick, onLean, children }, ref) => {
  const { active, pressed, handlers } = useLean(onLean);
  const hot = active || busy;
  const ms = hot ? ENTER_MS : EXIT_MS;
  return (
    <button ref={ref} type="button" disabled={disabled || busy} onClick={onClick} {...handlers} style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px', flex: 'none', whiteSpace: 'nowrap', padding: '9px 14px', borderRadius: '9px', outline: 'none',
      cursor: disabled || busy ? 'default' : 'pointer', fontFamily: FONT, fontSize: '13px', fontWeight: 500, letterSpacing: '-0.01em',
      border: `1px solid ${isLight ? (hot ? 'rgba(11,16,32,0.46)' : 'rgba(11,16,32,0.22)') : (hot ? 'rgba(255,255,255,0.44)' : 'rgba(255,255,255,0.24)')}`,
      background: isLight ? (hot ? 'rgba(11,16,32,0.04)' : 'rgba(11,16,32,0)') : (hot ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0)'),
      color: hot ? ink.strong : isLight ? 'rgba(11,16,32,0.84)' : 'rgba(255,255,255,0.88)',
      transform: pressed && !reduced ? 'scale(0.97)' : 'none',
      transition: `border-color ${ms}ms ${EASE}, background-color ${ms}ms ${EASE}, color ${ms}ms ${EASE}, transform ${PRESS_MS}ms ${EASE}`,
    }}>
      <SwapLabel id={busy ? 'busy' : 'idle'} reduced={reduced}>
        <span>{children}</span>
        {busy
          ? <Loader2 size={14} strokeWidth={1.9} className="animate-spin" aria-hidden />
          : arrow && <ArrowRight size={14} strokeWidth={1.9} aria-hidden style={{ flex: 'none', transform: active && !reduced ? 'translateX(3px)' : 'translateX(0)', transition: `transform ${ms}ms ${EASE}` }} />}
      </SwapLabel>
    </button>
  );
});
CtaButton.displayName = 'CtaButton';

export const TextButton: React.FC<{
  ink: Ink; reduced: boolean; disabled?: boolean; onClick?: () => void; onLean?: (active: boolean) => void;
  tone?: { rest: string; hot: string }; size?: number; style?: React.CSSProperties; children: React.ReactNode;
}> = ({ ink, reduced, disabled = false, onClick, onLean, tone, size = 13, style, children }) => {
  const { active, pressed, handlers } = useLean(onLean);
  const rest = tone?.rest ?? ink.faint;
  const hot = tone?.hot ?? ink.body;
  return (
    <button type="button" disabled={disabled} onClick={onClick} {...handlers} style={{
      background: 'none', border: 0, padding: '9px 0', flex: 'none', whiteSpace: 'nowrap', outline: 'none',
      cursor: disabled ? 'default' : 'pointer', fontFamily: FONT, fontSize: `${size}px`, fontWeight: 500, letterSpacing: '-0.008em',
      color: active || disabled ? hot : rest,
      transform: pressed && !reduced ? 'scale(0.97)' : 'none',
      transition: `color ${active ? ENTER_MS : EXIT_MS}ms ${EASE}, transform ${PRESS_MS}ms ${EASE}`,
      ...style,
    }}>{children}</button>
  );
};

export const CloseButton: React.FC<{ ink: Ink; reduced: boolean; label: string; disabled?: boolean; onClick?: () => void }> = ({ ink, reduced, label, disabled = false, onClick }) => {
  const { active, pressed, handlers } = useLean();
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} {...handlers} style={{
      position: 'absolute', top: '14px', right: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '28px', height: '28px', borderRadius: '8px', border: 0, padding: 0, outline: 'none',
      background: active ? 'rgba(127,127,140,0.12)' : 'rgba(127,127,140,0)', cursor: disabled ? 'default' : 'pointer',
      color: active ? ink.body : ink.faint, transform: pressed && !reduced ? 'scale(0.92)' : 'none',
      transition: `color ${active ? ENTER_MS : EXIT_MS}ms ${EASE}, background-color ${active ? ENTER_MS : EXIT_MS}ms ${EASE}, transform ${PRESS_MS}ms ${EASE}`,
    }}><X size={16} strokeWidth={1.9} aria-hidden /></button>
  );
};
