/**
 * ModesSettings — full Modes Manager
 *
 * Reconstructed from the compiled bundle at:
 *   /Natively-Recovered-Source/recovered/reconstructed/readable/dist/assets/App-h7VwvpAg.js
 *   lines ~28100–32710 (components: wL, eL, tL, uL, vL, jL, kL, gL, rL, yu, etc.)
 *
 * CSS tokens, layout, and interactions are taken verbatim from the bundle.
 * React/TypeScript syntax was necessarily rewritten since the source is compiled JS.
 */
import { ThinkingOrb } from 'thinking-orbs';
import { NOTE_TEMPLATES, NOTE_TEMPLATE_GROUPS, MODE_DEFAULT_NOTE_TEMPLATE_ID } from '../../electron/services/meeting/noteTemplates';
import { useResolvedTheme } from '../../src/hooks/useResolvedTheme';
import { LiquidGlassButton } from '../../src/ui-components/LiquidGlassButton';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Briefcase,
  Check,
  ChevronRight,
  ChevronDown,
  CodeXml,
  Headphones,
  MessageSquare,
  PenLine,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
  Paperclip,
  FileText,
  Download,
} from 'lucide-react';

// ─── CSS ────────────────────────────────────────────────────────────────────
const CSS = `
    .modes-manager-root {
        --mm-bg: #111111;
        --mm-sidebar-bg: #0e0e0e;
        --mm-border: rgba(255,255,255,0.07);
        --mm-text-hero: #ffffff;
        --mm-text-primary: rgba(255,255,255,0.85);
        --mm-text-secondary: rgba(255,255,255,0.55);
        --mm-text-tertiary: rgba(255,255,255,0.35);
        --mm-btn-bg: rgba(255,255,255,0.06);
        --mm-btn-bg-hover: rgba(255,255,255,0.1);
        --mm-btn-border: rgba(255,255,255,0.1);
        --mm-item-hover: rgba(255,255,255,0.04);
        --mm-item-active: rgba(255,255,255,0.08);
        --mm-input-bg: transparent;
        --mm-input-border: rgba(255,255,255,0.1);
        --mm-danger: #ef4444;
        --mm-danger-bg: rgba(239,68,68,0.12);
        --mm-warning-bg: rgba(251,191,36,0.08);
        --mm-warning-border: rgba(251,191,36,0.2);
        --mm-warning-text: rgba(251,191,36,0.9);
        --mm-active-blue: var(--periwinkle-300);
        --mm-card-border: rgba(255,255,255,0.1);
    }

    .modes-manager-root[data-theme='light'] {
        --mm-bg: #ffffff;
        --mm-sidebar-bg: #f9f9f9;
        --mm-border: rgba(0,0,0,0.08);
        --mm-text-hero: #111827;
        --mm-text-primary: #374151;
        --mm-text-secondary: #6b7280;
        --mm-text-tertiary: #9ca3af;
        --mm-btn-bg: rgba(0,0,0,0.04);
        --mm-btn-bg-hover: rgba(0,0,0,0.08);
        --mm-btn-border: rgba(0,0,0,0.05);
        --mm-item-hover: rgba(0,0,0,0.03);
        --mm-item-active: rgba(0,0,0,0.06);
        --mm-input-bg: transparent;
        --mm-input-border: rgba(0,0,0,0.1);
        --mm-danger: #ef4444;
        --mm-danger-bg: rgba(239,68,68,0.08);
        --mm-warning-bg: rgba(217,119,6,0.08);
        --mm-warning-border: rgba(217,119,6,0.2);
        --mm-warning-text: #b45309;
        --mm-active-blue: var(--periwinkle-600);
        --mm-card-border: rgba(0,0,0,0.1);
    }

    .modes-manager-root {
        --mm-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
        --mm-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
        --mm-ease-expo: cubic-bezier(0.16, 1, 0.3, 1);
        --mm-spring: linear(0, 0.0229, 0.0789, 0.1534, 0.2363, 0.3211, 0.4034, 0.4807, 0.5515, 0.6152, 0.6717, 0.7214, 0.7645, 0.8018, 0.8337, 0.861, 0.8841, 0.9036, 0.9201, 0.9339, 0.9454, 0.9551, 0.9631, 0.9698, 0.9753, 0.9799, 0.9837, 0.9868, 0.9894, 0.9915, 0.9932, 0.9946, 0.9958, 0.9968, 0.9975, 0.9982, 0.9987, 0.9991, 0.9995, 0.9998, 1);
        --mm-input-border-focus: color-mix(in srgb, var(--mm-active-blue) 38%, transparent);
        --mm-input-bg-focus: color-mix(in srgb, var(--mm-active-blue) 5%, transparent);
        --mm-pending-border: color-mix(in srgb, var(--mm-warning-text) 45%, transparent);
        --mm-card-border-hover: color-mix(in srgb, var(--mm-text-hero) 22%, transparent);
        --mm-card-bg-hover: color-mix(in srgb, var(--mm-text-hero) 3%, transparent);
    }

    @keyframes mm-list-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes mm-fade-only {
        from { opacity: 0; }
        to   { opacity: 1; }
    }
    @keyframes mm-pop-in {
        from { opacity: 0; transform: scale(0.97); }
        to   { opacity: 1; transform: scale(1); }
    }
    @keyframes mm-fade-out {
        to { opacity: 0; }
    }
    @keyframes mm-check-in {
        from { opacity: 0; transform: scale(0.4); }
        to   { opacity: 1; transform: scale(1); }
    }
    @keyframes mm-panel-fade {
        from { opacity: 0; transform: translateY(16px); filter: blur(6px); }
        45%  { opacity: 1; }
        to   { opacity: 1; transform: translateY(0); filter: blur(0); }
    }
    @keyframes mm-save-pulse {
        0%   { transform: scale(1); }
        45%  { transform: scale(1.045); }
        100% { transform: scale(1); }
    }
    .mm-save-pulse {
        animation: mm-save-pulse 360ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .mm-sel-indicator {
        position: absolute;
        top: 0;
        left: 8px;
        right: 8px;
        background: var(--mm-item-active);
        border-radius: 6px;
        pointer-events: none;
        z-index: 0;
        will-change: transform;
        transition:
            transform 250ms var(--mm-ease-out),
            opacity 240ms ease;
    }
    .mm-sel-indicator[data-instant='true'] { transition: opacity 160ms ease; }

    .mm-mode-item { animation: mm-list-in 420ms var(--mm-ease-expo) backwards; }
    .mm-mode-item:nth-child(2)   { animation-delay: 0ms; }
    .mm-mode-item:nth-child(3)   { animation-delay: 55ms; }
    .mm-mode-item:nth-child(4)   { animation-delay: 110ms; }
    .mm-mode-item:nth-child(5)   { animation-delay: 160ms; }
    .mm-mode-item:nth-child(6)   { animation-delay: 205ms; }
    .mm-mode-item:nth-child(7)   { animation-delay: 245ms; }
    .mm-mode-item:nth-child(8)   { animation-delay: 280ms; }
    .mm-mode-item:nth-child(n+9) { animation-delay: 310ms; }

    .mm-mode-item { background: transparent; }
    .mm-mode-item:hover { background: var(--mm-item-hover); }
    .mm-mode-item:focus { outline: none; }

    .mm-template-row { animation: mm-list-in 420ms var(--mm-ease-expo) backwards; }
    .mm-template-row.mm-press { background: transparent; }
    .mm-template-row.mm-press:hover { background: var(--mm-item-hover); }
    .mm-template-row:nth-child(1)   { animation-delay: 40ms; }
    .mm-template-row:nth-child(2)   { animation-delay: 95ms; }
    .mm-template-row:nth-child(3)   { animation-delay: 150ms; }
    .mm-template-row:nth-child(4)   { animation-delay: 200ms; }
    .mm-template-row:nth-child(5)   { animation-delay: 245ms; }
    .mm-template-row:nth-child(6)   { animation-delay: 285ms; }
    .mm-template-row:nth-child(7)   { animation-delay: 320ms; }
    .mm-template-row:nth-child(8)   { animation-delay: 350ms; }
    .mm-template-row:nth-child(n+9) { animation-delay: 375ms; }

    .mm-section-card { animation: mm-list-in 420ms var(--mm-ease-expo) backwards; }
    .mm-section-card:nth-child(1)   { animation-delay: 0ms; }
    .mm-section-card:nth-child(2)   { animation-delay: 55ms; }
    .mm-section-card:nth-child(3)   { animation-delay: 110ms; }
    .mm-section-card:nth-child(4)   { animation-delay: 160ms; }
    .mm-section-card:nth-child(5)   { animation-delay: 205ms; }
    .mm-section-card:nth-child(n+6) { animation-delay: 240ms; }

    .mm-fresh-row { animation: mm-list-in 420ms var(--mm-ease-expo) backwards; }

    @keyframes mm-swap-in {
        from { opacity: 0; filter: blur(2px); }
    }
    .mm-swap-in { animation: mm-swap-in 250ms var(--mm-ease-out) backwards; }

    .mm-press {
        transition:
            background 180ms var(--mm-ease-out),
            color 180ms ease,
            border-color 180ms ease,
            transform 160ms var(--mm-ease-out);
    }
    .mm-press:active { transform: scale(0.97); }

    .mm-press-soft {
        transition:
            background 180ms var(--mm-ease-out),
            color 180ms ease,
            transform 140ms var(--mm-ease-out);
    }
    .mm-press-soft:active { transform: scale(0.92); }

    .mm-banner-slot {
        display: grid;
        grid-template-rows: 0fr;
        flex-shrink: 0;
        transition: grid-template-rows 320ms var(--mm-spring);
    }
    .mm-banner-slot[data-open='true'] {
        grid-template-rows: 1fr;
        transition-duration: 480ms;
    }
    .mm-banner-slot > div { min-height: 0; overflow: hidden; }
    .mm-banner-slot .mm-banner {
        opacity: 0;
        transform: translateY(-4px);
        transition: opacity 150ms var(--mm-ease-out), transform 150ms var(--mm-ease-out);
    }
    .mm-save-fail {
        opacity: 0;
        transform: translateY(4px);
        filter: blur(2px);
        transition: opacity 150ms ease-in-out, transform 150ms ease-in-out, filter 150ms ease-in-out;
    }
    .mm-save-fail[data-shown='true'] {
        opacity: 1;
        transform: none;
        filter: none;
        transition-duration: 250ms;
        transition-timing-function: var(--mm-ease-out);
    }
    .mm-banner-slot[data-open='true'] .mm-banner {
        opacity: 1;
        transform: none;
        transition-duration: 300ms;
        transition-delay: 60ms;
    }

    .mm-prompt-foot {
        grid-area: 1 / 1;
        display: flex;
        align-items: center;
        min-width: 0;
        opacity: 0;
        filter: blur(2px);
        visibility: hidden;
        transition:
            opacity 150ms ease-in-out,
            filter 150ms ease-in-out,
            visibility 0s linear 150ms;
    }
    .mm-prompt-foot[data-shown='true'] {
        opacity: 1;
        filter: none;
        visibility: visible;
        transition:
            opacity 250ms var(--mm-ease-out) 60ms,
            filter 250ms var(--mm-ease-out) 60ms,
            visibility 0s;
    }

    .mm-pill {
        height: 28px;
        padding: 0 12px;
        border: none;
        border-radius: 100px;
        background: transparent;
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        flex-shrink: 0;
        cursor: pointer;
    }
    .mm-pill:disabled { opacity: 0.5; cursor: default; }
    .mm-pill--ghost { padding: 0 10px; color: var(--mm-text-secondary); }
    .mm-pill--ghost:hover { background: var(--mm-btn-bg); color: var(--mm-text-primary); }
    .mm-pill--icon { width: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
    .mm-pill--danger { color: var(--mm-danger); }
    .mm-pill--danger:hover { background: var(--mm-danger-bg); }
    .mm-pill--primary { background: var(--mm-btn-bg-hover); color: var(--mm-active-blue); font-weight: 600; }
    .mm-pill--primary:hover:not(:disabled) { background: color-mix(in srgb, var(--mm-active-blue) 16%, transparent); }

    .mm-dropdown {
        transform-origin: top right;
        animation: mm-pop-in 180ms var(--mm-ease-out) backwards;
    }
    @keyframes mm-pop-out {
        to { opacity: 0; transform: scale(0.99); }
    }
    .mm-dropdown[data-closing='true'] {
        animation: mm-pop-out 150ms var(--mm-ease-out) forwards;
        pointer-events: none;
    }

    @keyframes mm-tp-in {
        from { opacity: 0; transform: translateY(-4px) scale(0.97); }
    }
    @keyframes mm-tp-out {
        to { opacity: 0; transform: translateY(-2px) scale(0.99); }
    }
    .mm-tp-menu {
        animation: mm-tp-in 250ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
        will-change: transform, opacity;
    }
    .mm-tp-menu[data-closing='true'] {
        animation: mm-tp-out 150ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        pointer-events: none;
    }
    .mm-tp-trigger { background: var(--mm-btn-bg); }
    .mm-tp-trigger:hover,
    .mm-tp-trigger[data-open='true'] { background: var(--mm-btn-bg-hover); }
    .mm-tp-trigger:hover:not([data-open='true']) .mm-nt-chevron { transform: translateY(1px); }
    .mm-tp-trigger[data-open='true'] .mm-nt-chevron { transform: rotate(180deg); }

    @keyframes mm-nt-in {
        from { opacity: 0; transform: translateY(4px) scale(0.97); }
    }
    @keyframes mm-nt-out {
        to { opacity: 0; transform: translateY(2px) scale(0.99); }
    }
    .mm-nt-menu {
        animation: mm-nt-in 250ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
        will-change: transform, opacity;
    }
    .mm-nt-menu[data-closing='true'] {
        animation: mm-nt-out 150ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        pointer-events: none;
    }
    .mm-nt-highlight {
        position: absolute;
        top: 0;
        left: 4px;
        right: 4px;
        border-radius: 6px;
        background: var(--mm-btn-bg-hover);
        opacity: 0;
        pointer-events: none;
        transition: opacity 150ms ease-out, scale 140ms var(--mm-ease-out);
    }
    .mm-nt-highlight[data-placed='true'] {
        transition:
            transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
            height 200ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 150ms ease-out,
            scale 140ms var(--mm-ease-out);
    }
    .mm-nt-highlight[data-shown='true'] { opacity: 1; }
    .mm-nt-highlight[data-pressed='true'] { scale: 0.98; }
    .mm-nt-row { background: transparent; transition: background 180ms var(--mm-ease-out); }
    .mm-nt-row[data-on='true'] { background: var(--mm-btn-bg-hover); }
    .mm-nt-check path { stroke-dasharray: 1; stroke-dashoffset: 0; }
    .mm-nt-check[data-draw='true'] path { animation: mm-nt-draw 220ms var(--mm-ease-out) backwards; }
    @keyframes mm-nt-draw {
        from { stroke-dashoffset: 1; }
    }
    .mm-nt-trigger { color: var(--mm-text-tertiary); }
    .mm-nt-trigger:hover,
    .mm-nt-trigger[data-open='true'] { color: var(--mm-text-primary); }
    .mm-nt-chevron {
        display: inline-flex;
        transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .mm-nt-trigger:hover:not([data-open='true']) .mm-nt-chevron { transform: translateY(-1px); }
    .mm-nt-trigger[data-open='true'] .mm-nt-chevron { transform: rotate(180deg); }
    .mm-notes-applying {
        opacity: 0.4;
        filter: blur(1px);
        transition: opacity 150ms ease-out, filter 150ms ease-out;
    }

    .mm-active-check { animation: mm-check-in 320ms var(--mm-ease-spring) backwards; }

    .mm-check-slot {
        --mm-slot-gap: 4px;
        display: flex;
        justify-content: flex-end;
        width: 16px;
        flex-shrink: 0;
    }
    .mm-check-slot:first-child { --mm-slot-gap: 0px; }
    @keyframes mm-slot-open {
        from { width: 0; margin-left: calc(var(--mm-slot-gap) * -1); }
    }
    @keyframes mm-slot-close {
        to { width: 0; margin-left: calc(var(--mm-slot-gap) * -1); }
    }
    @keyframes mm-check-out {
        to { opacity: 0; transform: scale(0.6); }
    }
    .mm-check-slot[data-phase='enter'] { animation: mm-slot-open 250ms var(--mm-ease-out) backwards; }
    .mm-check-slot[data-phase='exit'] { animation: mm-slot-close 150ms var(--mm-ease-out) forwards; }
    .mm-check-slot[data-phase='exit'] .mm-active-check { animation: mm-check-out 150ms var(--mm-ease-out) forwards; }

    .mm-morph {
        position: relative;
        display: inline-block;
        white-space: nowrap;
        transition: width 250ms var(--mm-ease-out);
    }
    .mm-morph-label {
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        opacity: 0;
        filter: blur(2px);
        pointer-events: none;
        transition: opacity 150ms ease-in-out, filter 150ms ease-in-out;
    }
    .mm-morph[data-align='start'] .mm-morph-label { left: 0; transform: none; }
    .mm-morph-label[data-shown='true'] { opacity: 1; filter: none; }

    .mm-saved-check path {
        stroke-dasharray: 1 2;
        stroke-dashoffset: 1.05;
        transition: stroke-dashoffset 0s linear 150ms;
    }
    .mm-morph-label[data-shown='true'] .mm-saved-check path {
        stroke-dashoffset: 0;
        transition: stroke-dashoffset 300ms var(--mm-ease-out) 80ms;
    }

    .mm-tpl-chevron {
        display: inline-flex;
        transition: transform 350ms var(--mm-ease-out);
    }
    .mm-template-row:hover .mm-tpl-chevron { transform: translateX(2px); }

    .mm-panel-content { animation: mm-panel-fade 420ms var(--mm-ease-expo) backwards; }

    @keyframes mm-content-fade {
        from { opacity: 0; filter: blur(8px); }
        to   { opacity: 1; filter: blur(0); }
    }

    @keyframes mm-open-panel {
        from { opacity: 0; transform: translateY(16px); filter: blur(6px); }
        45%  { opacity: 1; }
        to   { opacity: 1; transform: translateY(0); filter: blur(0); }
    }
    @keyframes mm-open-block {
        from { opacity: 0; transform: translateY(16px); }
        60%  { opacity: 1; }
        to   { opacity: 1; transform: translateY(0); }
    }
    .mm-cascade { animation: mm-open-panel 420ms var(--mm-ease-expo) backwards; }
    .mm-cascade > * { animation: mm-open-block 520ms var(--mm-ease-expo) backwards; }
    .mm-cascade > *:nth-child(1)    { animation-delay: 40ms; }
    .mm-cascade > *:nth-child(2)    { animation-delay: 95ms; }
    .mm-cascade > *:nth-child(3)    { animation-delay: 150ms; }
    .mm-cascade > *:nth-child(4)    { animation-delay: 205ms; }
    .mm-cascade > *:nth-child(5)    { animation-delay: 255ms; }
    .mm-cascade > *:nth-child(6)    { animation-delay: 300ms; }
    .mm-cascade > *:nth-child(7)    { animation-delay: 340ms; }
    .mm-cascade > *:nth-child(8)    { animation-delay: 375ms; }
    .mm-cascade > *:nth-child(9)    { animation-delay: 405ms; }
    .mm-cascade > *:nth-child(n+10) { animation-delay: 430ms; }

    .mm-cascade[data-switch='true'] { animation: mm-switch-panel 140ms var(--mm-ease-out) backwards; }
    @keyframes mm-switch-panel {
        from { opacity: 0.5; }
        to   { opacity: 1; }
    }
    @keyframes mm-switch-block {
        from { opacity: 0; transform: translateX(18px); }
        to   { opacity: 1; transform: translateX(0); }
    }
    .mm-cascade[data-switch='true'] > * { animation: mm-switch-block 260ms var(--mm-ease-out) backwards; }
    .mm-cascade[data-switch='true'] > *:nth-child(1)    { animation-delay: 0ms; }
    .mm-cascade[data-switch='true'] > *:nth-child(2)    { animation-delay: 45ms; }
    .mm-cascade[data-switch='true'] > *:nth-child(3)    { animation-delay: 90ms; }
    .mm-cascade[data-switch='true'] > *:nth-child(4)    { animation-delay: 135ms; }
    .mm-cascade[data-switch='true'] > *:nth-child(5)    { animation-delay: 175ms; }
    .mm-cascade[data-switch='true'] > *:nth-child(6)    { animation-delay: 215ms; }
    .mm-cascade[data-switch='true'] > *:nth-child(7)    { animation-delay: 250ms; }
    .mm-cascade[data-switch='true'] > *:nth-child(8)    { animation-delay: 280ms; }
    .mm-cascade[data-switch='true'] > *:nth-child(9)    { animation-delay: 305ms; }
    .mm-cascade[data-switch='true'] > *:nth-child(n+10) { animation-delay: 325ms; }

    .mm-input-box { transition: border-color 180ms var(--mm-ease-out), background 180ms ease; }

    @keyframes mm-spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
    }
    .mm-spinner {
        flex-shrink: 0;
        animation: mm-spin 0.8s linear infinite;
        transform-origin: center;
    }

    @media (prefers-reduced-motion: reduce) {
        .mm-mode-item,
        .mm-template-row,
        .mm-section-card,
        .mm-fresh-row,
        .mm-swap-in,
        .mm-dropdown,
        .mm-active-check,
        .mm-panel-content,
        .mm-cascade,
        .mm-cascade > *,
        .mm-cascade[data-switch='true'],
        .mm-cascade[data-switch='true'] > * {
            animation-name: mm-fade-only;
            animation-duration: 200ms;
            animation-timing-function: ease;
            animation-delay: 0ms !important;
        }
        .mm-press:active,
        .mm-press-soft:active { transform: none; }
        .mm-panel-content,
        .mm-swap-in,
        .mm-prompt-foot,
        .mm-cascade,
        .mm-cascade > *,
        .mm-cascade[data-switch='true'],
        .mm-cascade[data-switch='true'] > * { filter: none; }
        .mm-sel-indicator { transition: opacity 160ms ease; }
        .mm-dropdown[data-closing='true'],
        .mm-check-slot[data-phase='exit'] .mm-active-check { animation: mm-fade-out 150ms ease forwards; }
        .mm-banner-slot,
        .mm-morph { transition: none; }
        .mm-save-fail { transform: none; filter: none; }
        .mm-check-slot[data-phase] { animation: none; }
        .mm-banner-slot .mm-banner { transform: none; }
        .mm-save-pulse { animation: none; }
        .mm-tpl-chevron { transition: none; }
        .mm-template-row:hover .mm-tpl-chevron { transform: none; }
        .mm-saved-check path { stroke-dashoffset: 0; transition: none; }
        .mm-nt-menu { animation-name: mm-fade-only; animation-duration: 150ms; }
        .mm-nt-menu[data-closing='true'] { animation: mm-fade-out 150ms ease forwards; }
        .mm-tp-menu { animation-name: mm-fade-only; animation-duration: 150ms; }
        .mm-tp-menu[data-closing='true'] { animation: mm-fade-out 150ms ease forwards; }
        .mm-tp-trigger:hover:not([data-open='true']) .mm-nt-chevron { transform: none; }
        .mm-nt-highlight,
        .mm-nt-highlight[data-placed='true'] { transition: opacity 150ms ease-out; scale: none; }
        .mm-nt-check[data-draw='true'] path { animation: none; }
        .mm-nt-chevron { transition: none; }
        .mm-nt-trigger:hover:not([data-open='true']) .mm-nt-chevron { transform: none; }
        .mm-notes-applying { filter: none; }
        .mm-spinner { animation: none; opacity: 0.5; }
    }
`;

// ─── Types ───────────────────────────────────────────────────────────────────
interface Mode {
  id: string;
  name: string;
  templateType: string;
  customContext: string;
  isActive: boolean;
  isBuiltin?: boolean;
  createdAt: string;
  referenceFileCount: number;
}

interface ReferenceFile {
  id: string;
  fileName: string;
  content?: string;
}

interface NoteSection {
  id: string;
  title: string;
  description?: string;
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; title: string }> = {
  ready: { label: 'Indexed', color: '#22c55e', bg: 'rgba(34,197,94,0.14)', title: 'Semantic search ready' },
  indexing: { label: 'Indexing…', color: '#3b82f6', bg: 'rgba(59,130,246,0.14)', title: 'Building the search index' },
  pending: { label: 'Indexing…', color: '#3b82f6', bg: 'rgba(59,130,246,0.14)', title: 'Queued for indexing' },
  failed: { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.14)', title: 'Indexing failed — keyword search still works; re-activating the mode retries' },
  lexical_only: { label: 'Keyword', color: '#f59e0b', bg: 'rgba(245,158,11,0.14)', title: 'Keyword search is active; semantic indexing will retry when embeddings are ready' },
};
function ReferenceFileStatus({ status, fileName }: { status?: string; fileName: string }) {
  const started = useRef<number | null>(null);
  const [shown, setShown] = useState(status);
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const busy = status === 'pending' || status === 'indexing';
    const wasBusy = shown === 'pending' || shown === 'indexing';
    if (busy) {
      if (delayTimer.current) { clearTimeout(delayTimer.current); delayTimer.current = null; }
      if (started.current === null) started.current = Date.now();
      setShown(status);
      return;
    }
    if (wasBusy && started.current !== null) {
      const remaining = 2000 - (Date.now() - started.current);
      if (remaining > 0) {
        if (delayTimer.current) clearTimeout(delayTimer.current);
        delayTimer.current = setTimeout(() => { setShown(status); started.current = null; delayTimer.current = null; }, remaining);
        return;
      }
    }
    setShown(status);
    started.current = null;
  }, [status]);
  useEffect(() => () => { if (delayTimer.current) clearTimeout(delayTimer.current); }, []);
  const currentConfig = shown ? STATUS_STYLES[shown] : undefined;
  const previousLabel = useRef<string | undefined>(undefined);
  const [display, setDisplay] = useState(currentConfig);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (!display || currentConfig?.label === display.label) { setDisplay(currentConfig); setFading(false); return; }
    setFading(true);
    const timer = setTimeout(() => { setDisplay(currentConfig); setFading(false); }, 150);
    return () => clearTimeout(timer);
  }, [currentConfig, display]);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const messages: Record<string, string> = { ready: 'indexing complete, semantic search ready', indexing: 'indexing started', pending: 'queued for indexing', failed: 'indexing failed, keyword search still works', lexical_only: 'keyword search active, semantic indexing will retry' };
    if (previousLabel.current !== undefined && currentConfig?.label !== previousLabel.current && shown && messages[shown]) setAnnouncement(`${fileName ? `${fileName}: ` : ''}${messages[shown]}`);
    previousLabel.current = currentConfig?.label;
  }, [currentConfig?.label, shown, fileName]);
  if (!currentConfig) return null;
  const config = display ?? currentConfig;
  return <span style={{ display: 'grid', gridTemplateColumns: '20px 12px 72px', alignItems: 'center', width: 104, flexShrink: 0 }}>
    <span aria-hidden="true" style={{ gridColumn: 1, width: 20, height: 20 }} />
    <span title={config.title} style={{ gridColumn: 3, justifySelf: 'start', fontSize: 9.5, fontWeight: 600, letterSpacing: .2, padding: '2px 6px', borderRadius: 999, color: config.color, background: config.bg, flexShrink: 0, textTransform: 'uppercase', opacity: fading ? 0 : 1, filter: fading ? 'blur(2px)' : 'blur(0px)', transition: 'opacity 150ms ease-in-out, filter 150ms ease-in-out' }}>{config.label}</span>
    <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>{announcement}</span>
  </span>;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'var(--mm-success, #4ade80)', medium: 'var(--mm-text-secondary)', low: 'var(--mm-text-tertiary)',
};

const KnowledgePanel: React.FC<{ file: ReferenceFile; pack: any; loading: boolean; regenerating: boolean; expandedCardId: string | null; userEditableCardsEnabled: boolean; onToggleCard: (cardId: string) => void; onApproveCard: (cardId: string) => void; onRejectCard: (cardId: string) => void; onRegenerate: () => void; onExport: () => void }> = ({ pack, loading, regenerating, expandedCardId, userEditableCardsEnabled, onToggleCard, onApproveCard, onRejectCard, onRegenerate, onExport }) => {
  const groups = React.useMemo(() => {
    if (!pack) return new Map<string, any[]>();
    const result = new Map<string, any[]>();
    for (const card of pack.cards) {
      const cards = result.get(card.type) ?? [];
      cards.push(card);
      result.set(card.type, cards);
    }
    return result;
  }, [pack]);
  return <div data-knowledge-panel style={{ margin: '2px 0 8px 21px', padding: '12px 14px', borderRadius: 8, background: 'var(--mm-btn-bg, rgba(255,255,255,0.03))', border: '1px solid var(--mm-border, rgba(255,255,255,0.08))', display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--mm-text-tertiary)' }}>{loading ? 'Loading knowledge pack…' : pack ? `${pack.cards?.length ?? 0} cards · ${pack.entities?.length ?? 0} entities · ${pack.relations?.length ?? 0} relations (v${pack.packVersion})` : 'No knowledge pack generated yet.'}</span>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={onRegenerate} disabled={regenerating} className="mm-press-soft" title="Regenerate" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--mm-text-secondary)', background: 'transparent', border: 'none', cursor: regenerating ? 'default' : 'pointer', padding: '3px 6px' }}><RefreshCw size={11} className={regenerating ? 'mm-spinner' : undefined} />{regenerating ? 'Regenerating…' : 'Regenerate'}</button>
        {pack && (pack.cards?.length ?? 0) > 0 && <button onClick={onExport} className="mm-press-soft" title="Export OKF bundle" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--mm-text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 6px' }}><Download size={11} />Export</button>}
      </div>
    </div>
    {pack && (pack.cards?.length ?? 0) > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
      {[...groups.entries()].map(([type, cards]) => <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--mm-text-tertiary)', textTransform: 'uppercase', letterSpacing: .4, marginTop: 4 }}>{type.replace(/_/g, ' ')} ({cards.length})</span>
        {cards.map(card => <div key={card.id} style={{ display: 'flex', flexDirection: 'column' }}>
          <button onClick={() => onToggleCard(card.id)} className="mm-press-soft" style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 2px', opacity: card.approvalStatus === 'rejected' ? .5 : 1 }}>
            <ChevronRight size={11} style={{ color: 'var(--mm-text-tertiary)', flexShrink: 0, transition: 'transform 150ms ease', transform: expandedCardId === card.id ? 'rotate(90deg)' : 'none' }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--mm-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: card.approvalStatus === 'rejected' ? 'line-through' : 'none' }}>{card.title}</span>
            {card.userEdited && <span style={{ fontSize: 9, color: 'var(--mm-text-tertiary)', flexShrink: 0 }} title="user-edited">✎</span>}
            {card.approvalStatus === 'needs_review' && <span style={{ fontSize: 9, color: 'var(--mm-warning, #facc15)', flexShrink: 0 }} title="source changed since this edit — needs review">⚠</span>}
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: CONFIDENCE_COLOR[card.confidence] ?? 'var(--mm-text-tertiary)', flexShrink: 0 }} title={`confidence: ${card.confidence}`} />
            <span style={{ fontSize: 10, color: 'var(--mm-text-tertiary)', flexShrink: 0 }}>p{card.sourcePages.join(',')}</span>
          </button>
          {expandedCardId === card.id && <div style={{ margin: '2px 0 6px 17px', padding: '8px 10px', borderRadius: 6, background: 'var(--mm-bg-secondary, rgba(0,0,0,0.15))', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--mm-text-secondary)', lineHeight: 1.5 }}>{card.body}</p>
            {card.sourceSections.length > 0 && <span style={{ fontSize: 10, color: 'var(--mm-text-tertiary)' }}>Section: {card.sourceSections.join(', ')}</span>}
            {card.sourceQuotes.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{card.sourceQuotes.map((quote: { text: string; page: number }, index: number) => <span key={index} style={{ fontSize: 10, color: 'var(--mm-text-tertiary)', fontStyle: 'italic' }}>"{quote.text}" — p{quote.page}</span>)}</div>}
            <span style={{ fontSize: 10, color: 'var(--mm-text-tertiary)' }}>confidence: {card.confidence} · generated from: {card.generatedFrom.replace(/_/g, ' ')}{card.approvalStatus ? ` · ${card.approvalStatus.replace(/_/g, ' ')}` : ''}</span>
            {userEditableCardsEnabled && <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              {card.approvalStatus !== 'approved' && <button onClick={() => onApproveCard(card.id)} className="mm-press-soft" style={{ fontSize: 10, color: 'var(--mm-success, #4ade80)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>Approve</button>}
              {card.approvalStatus !== 'rejected' && <button onClick={() => onRejectCard(card.id)} className="mm-press-soft" style={{ fontSize: 10, color: 'var(--mm-danger, #f87171)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>Reject</button>}
            </div>}
          </div>}
        </div>)}
      </div>)}
    </div>}
  </div>;
};

interface WritingSample {
  id: string;
  preview: string;
  source?: string;
}

interface WritingStyleInfo {
  sampleCount: number;
  title?: string;
  summary?: string;
}

// Default knowledge sources per template type (fL from bundle)
const DEFAULT_SOURCES: Record<string, string[]> = {
  general: ['reference_files'],
  sales: ['reference_files'],
  recruiting: ['reference_files'],
  'team-meet': ['reference_files'],
  lecture: ['reference_files'],
  seminar: ['reference_files'],
  'call-center': ['reference_files'],
  'looking-for-work': ['profile', 'job_description'],
  'technical-interview': ['profile', 'job_description'],
};

const defaultSourcesFor = (templateType: string): string[] =>
  DEFAULT_SOURCES[templateType] ?? ['reference_files'];

interface TemplateDefinition {
  type: string;
  label: string;
  description: string;
  Icon: React.FC<{ size?: number }>;
  iconBg: string;
  iconColor: string;
}

// ─── Template definitions (from bundle Fd) ───────────────────────────────────
const TEMPLATES: TemplateDefinition[] = [
  {
    type: 'sales', label: 'Sales',
    description: 'Close deals with strategic discovery and objection handling.',
    Icon: ({ size = 16 }) => <Briefcase size={size} />,
    iconBg: 'rgba(249,115,22,0.18)', iconColor: '#f97316',
  },
  {
    type: 'recruiting', label: 'Recruiting',
    description: 'Evaluate candidates with structured interview insights.',
    Icon: ({ size = 16 }) => <Users size={size} />,
    iconBg: 'rgba(168,85,247,0.18)', iconColor: '#a855f7',
  },
  {
    type: 'team-meet', label: 'Team Meet',
    description: 'Track action items and key decisions from meetings.',
    Icon: ({ size = 16 }) => <MessageSquare size={size} />,
    iconBg: 'rgba(20,184,166,0.18)', iconColor: '#14b8a6',
  },
  {
    type: 'looking-for-work', label: 'Looking for work',
    description: 'Answer interview questions with confidence and clarity.',
    Icon: ({ size = 16 }) => <Search size={size} />,
    iconBg: 'rgba(59,130,246,0.18)', iconColor: '#3b82f6',
  },
  {
    type: 'lecture', label: 'Lecture',
    description: 'Capture key concepts and content from lectures.',
    Icon: ({ size = 16 }) => <BookOpen size={size} />,
    iconBg: 'rgba(168,85,247,0.18)', iconColor: '#a855f7',
  },
  {
    type: 'technical-interview', label: 'Technical Interview',
    description: 'Ace DSA, system design, and coding rounds with structured thinking.',
    Icon: ({ size = 16 }) => <CodeXml size={size} />,
    iconBg: 'rgba(34,197,94,0.18)', iconColor: '#22c55e',
  },
  {
    type: 'seminar', label: 'Seminar',
    description: 'Answer from your slides, paper, or thesis — and flag anything that isn\'t in them.',
    Icon: ({ size = 16 }) => <Presentation size={size} />,
    iconBg: 'rgba(236,72,153,0.18)', iconColor: '#ec4899',
  },
  {
    type: 'call-center', label: 'Call Center',
    description: 'Work support calls from issue to resolution, with escalations tracked.',
    Icon: ({ size = 16 }) => <Headphones size={size} />,
    iconBg: 'rgba(234,179,8,0.18)', iconColor: '#eab308',
  },
];

const TEMPLATE_MAP = Object.fromEntries(TEMPLATES.map(t => [t.type, t]));

// xl() from bundle — only the default General mode is "locked" (no template change, shown differently)
function isLockedGeneral(mode: Mode): boolean { return mode.templateType === 'general' && mode.name === 'General'; }

function contextPlaceholder(templateType: string): string {
  return ({
    general: 'Tell Natively how to respond during the conversation.',
    sales: 'Add product info, ICP, value props, and common objections...',
    recruiting: 'Add the job description, competencies, and evaluation criteria...',
    'team-meet': 'Add context about the team, project, or meeting agenda...',
    'looking-for-work': 'Add your STAR stories, resume highlights, or job details...',
    lecture: 'Add course context, prerequisites, and what you want to capture...',
    'technical-interview': 'Add the role, company, topics to focus on, or your weak areas...',
    seminar: 'Add the talk title, audience, and the sections you expect questions on...',
    'call-center': 'Add the product, common issues, escalation paths, and policies to follow...',
  } as Record<string, string>)[templateType] ?? '';
}

const COLLAPSE_NOTES_MIN_HEIGHT = 56;

function collapseAndRun(el: HTMLElement | null, onDone: () => void, gap = 0, collapseTo = 0) {
  if (!el) { onDone(); return; }
  if (el.dataset.mmRemoving) return;
  el.dataset.mmRemoving = 'true';
  const h = el.offsetHeight;
  const border = el.offsetHeight - el.clientHeight;
  el.style.maxHeight = `${h}px`;
  el.style.overflow = 'hidden';
  void el.offsetHeight;
  el.style.transition = 'opacity 150ms var(--mm-ease-out), transform 150ms var(--mm-ease-out), max-height 320ms var(--mm-spring), margin 320ms var(--mm-spring), padding 320ms var(--mm-spring)';
  const target = Math.max(0, collapseTo - (getComputedStyle(el).boxSizing === 'border-box' ? 0 : border));
  el.style.opacity = '0';
  el.style.transform = collapseTo > 0 ? 'none' : 'translateY(-4px)';
  el.style.maxHeight = `${target}px`;
  if (collapseTo > 0) el.style.minHeight = `${target}px`;
  el.style.marginTop = '0px';
  el.style.marginBottom = collapseTo > 0 ? '0px' : `${-(gap + border)}px`;
  el.style.paddingTop = '0px';
  el.style.paddingBottom = '0px';
  setTimeout(onDone, 320);
}

function useSlotSwap<T extends string>(block: T, triggered: boolean, resetKey: string | null) {
  const [prev, setPrev] = useState({ block, resetKey });
  const [swapBlock, setSwapBlock] = useState<T | null>(null);
  if (resetKey !== prev.resetKey) {
    setPrev({ block, resetKey });
    setSwapBlock(null);
  } else if (block !== prev.block) {
    setPrev({ block, resetKey });
    setSwapBlock(triggered ? block : null);
  }
  return (b: T) => (swapBlock === b ? 'mm-swap-in' : undefined);
}

function SavedCheck() {
  return (
    <svg className="mm-saved-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" pathLength={1} />
    </svg>
  );
}

// ─── Styles object (Is from 3.2.0 bundle) ───────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', height: '100%',
    background: 'var(--mm-bg)',
    borderRadius: 16, overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
    color: 'var(--mm-text-primary)',
  },
  sidebar: {
    width: 240, borderRight: '1px solid var(--mm-sidebar-border)',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
    background: 'var(--mm-sidebar-bg)', paddingTop: 12,
  },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--mm-text-tertiary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '4px 8px', marginLeft: 8, marginBottom: 4,
    borderRadius: 6, alignSelf: 'flex-start',
    transition: 'color 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
  modeItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
    transition: 'background 180ms cubic-bezier(0.23, 1, 0.32, 1), color 180ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
    userSelect: 'none', fontSize: 13, marginBottom: 2,
  },
  activeCheck: {
    width: 16, height: 16, borderRadius: '50%',
    background: 'var(--mm-active-blue)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  templatesBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '6px 10px',
    background: 'none', border: 'none', borderRadius: 6,
    color: 'var(--mm-text-tertiary)', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', textAlign: 'left',
    transition: 'color 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
  rightPanel: { flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  setActiveBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 14px', height: 28, border: 'none', borderRadius: 100,
    background: 'var(--mm-btn-bg)', color: 'var(--mm-text-secondary)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
    transition: 'background 180ms cubic-bezier(0.23, 1, 0.32, 1), color 180ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
  sectionLabel: {
    fontSize: 15, fontWeight: 700, color: 'var(--mm-text-hero)',
    margin: 0, marginBottom: 10,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
    letterSpacing: '-0.02em', lineHeight: 1.2,
  },
  contentBox: {
    border: '1px solid var(--mm-input-border)', borderRadius: 12,
    minHeight: 76, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'text', overflow: 'hidden', background: 'var(--mm-input-bg)',
  },
  textarea: {
    width: '100%', minHeight: 76, background: 'transparent', border: 'none', outline: 'none',
    padding: '14px 16px', fontSize: 12, color: 'var(--mm-text-primary)',
    lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  },
  fileRow: {
    display: 'grid',
    gridTemplateColumns: '13px 1fr 104px 42px 20px',
    alignItems: 'center', gap: 7, padding: '8px 12px',
    background: 'var(--mm-btn-bg)', border: '1px solid var(--mm-btn-border)', borderRadius: 10,
  },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--mm-text-secondary)', padding: 4,
    display: 'flex', borderRadius: 4,
    transition: 'color 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
  saveBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--mm-btn-border)',
    borderRadius: 6, color: 'var(--mm-text-primary)',
    fontSize: 12, fontWeight: 500,
    padding: '4px 12px', cursor: 'pointer',
    transition: 'background 180ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
  dotsBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 100, border: 'none',
    background: 'var(--mm-btn-bg)', color: 'var(--mm-text-secondary)',
    cursor: 'pointer', flexShrink: 0,
    transition: 'background 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
  dotsDropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    background: 'var(--mm-bg)',
    border: '1px solid var(--mm-border)',
    borderRadius: 12,
    padding: '4px',
    minWidth: 116,
    boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
    zIndex: 100,
  },
  dotsDeleteBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    width: '100%', padding: '5px 8px',
    background: 'transparent', border: 'none', borderRadius: 5,
    color: 'var(--mm-danger)', fontSize: 11, fontWeight: 500,
    cursor: 'pointer', textAlign: 'left',
    transition: 'background 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
  addFileBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--mm-text-tertiary)', fontSize: 12, padding: '6px 2px', marginTop: 2,
    transition: 'color 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
  addSectionBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--mm-text-secondary)', fontSize: 12, padding: '4px 2px',
    transition: 'color 180ms cubic-bezier(0.23, 1, 0.32, 1), background 180ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1), border-color 180ms ease',
  },
  removeTplBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--mm-text-tertiary)', fontSize: 12, padding: 0,
    transition: 'color 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
  autofillPlaceholder: {
    fontSize: 12, color: 'var(--mm-text-tertiary)',
    textAlign: 'center', userSelect: 'none',
  },
  uploadBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '7px 18px', borderRadius: 20,
    background: 'var(--mm-btn-bg)', border: '1px solid var(--mm-btn-border)',
    color: 'var(--mm-text-primary)', fontSize: 12, fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
  },
};

const POLICY_CONTENT_BOX: React.CSSProperties = {
  border: '1px solid var(--mm-input-border)',
  borderRadius: 10,
  background: 'var(--mm-input-bg)',
};

// ─── ModesDialIcon (tL from bundle) ─────────────────────────────────────────
export function ModesDialIcon({ sz = 14, color = 'currentColor' }: { sz?: number; color?: string }) {
  return (
    <svg width={sz} height={sz} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="5.2" stroke={color} strokeWidth="0.9" strokeDasharray="1.4 1.8" fill="none" opacity="0.3" />
      <circle cx="8" cy="2.8" r="1.55" fill={color} />
      <circle cx="12.5" cy="10.6" r="1.1" fill={color} opacity="0.32" />
      <circle cx="3.5" cy="10.6" r="1.1" fill={color} opacity="0.32" />
      <circle cx="8" cy="8" r="0.9" fill={color} opacity="0.18" />
    </svg>
  );
}

// ─── InlineEdit (lp from bundle) ─────────────────────────────────────────────
function InlineEdit({
  value,
  onCommit,
  style = {},
  inputStyle = {},
  disabled = false,
  autoEdit = false,
  onEditEnd,
}: {
  value: string;
  onCommit: (v: string) => void;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  disabled?: boolean;
  autoEdit?: boolean;
  onEditEnd?: () => void;
}) {
  const [editing, setEditing] = useState(autoEdit && !disabled);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (editing && ref.current) { ref.current.focus(); ref.current.select(); }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onCommit(draft.trim());
    else setDraft(value);
    onEditEnd?.();
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
            setDraft(value);
            onEditEnd?.();
          }
        }}
        style={{
          background: 'transparent', border: 'none',
          borderBottom: '1px solid var(--mm-input-border-focus)',
          outline: 'none', color: 'inherit', width: '100%',
          ...inputStyle,
        }}
      />
    );
  }

  return (
    <span
      style={{ cursor: disabled ? 'inherit' : 'text', ...style }}
      onDoubleClick={() => !disabled && setEditing(true)}
      title={disabled ? undefined : 'Double-click to rename'}
    >
      {value}
    </span>
  );
}

// ─── BannerSlot (RD from bundle) ─────────────────────────────────────────────
function BannerSlot({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="mm-banner-slot"
      data-open={open ? 'true' : undefined}
      aria-hidden={!open}
      {...(open ? null : { inert: true as any })}
    >
      <div>
        <div style={{ padding: '16px 32px 12px' }}>{children}</div>
      </div>
    </div>
  );
}

// ─── ActiveCheck (PD from bundle) ────────────────────────────────────────────
function ActiveCheck({ active }: { active: boolean }) {
  const [phase, setPhase] = useState<'rest' | 'enter' | 'exit' | null>(active ? 'rest' : null);
  const [prev, setPrev] = useState(active);

  if (active !== prev) {
    setPrev(active);
    setPhase(active ? 'enter' : 'exit');
  }

  useEffect(() => {
    if (phase !== 'exit') return;
    const t = setTimeout(() => setPhase(null), 150);
    return () => clearTimeout(t);
  }, [phase]);

  if (!phase) return null;

  return (
    <span className="mm-check-slot" data-phase={phase}>
      <span className="mm-active-check" style={S.activeCheck}>
        <Check size={9} strokeWidth={3} style={{ color: 'var(--mm-bg)' }} />
      </span>
    </span>
  );
}

// ─── ActivateBtn (UD from bundle) ────────────────────────────────────────────
function ActivateBtn({ isActive, onActivate, onDeactivate }: {
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const [hover, setHover] = useState(false);
  const showDeactivate = isActive && hover;
  const shown: 'setActive' | 'active' | 'deactivate' = showDeactivate ? 'deactivate' : isActive ? 'active' : 'setActive';
  const labelRefs = useRef<{
    setActive: HTMLSpanElement | null;
    active: HTMLSpanElement | null;
    deactivate: HTMLSpanElement | null;
  }>({ setActive: null, active: null, deactivate: null });
  const [widths, setWidths] = useState<{ setActive: number; active: number; deactivate: number } | null>(null);

  useLayoutEffect(() => {
    const refs = labelRefs.current;
    if (refs.setActive && refs.active && refs.deactivate) {
      setWidths({
        setActive: refs.setActive.getBoundingClientRect().width,
        active: refs.active.getBoundingClientRect().width,
        deactivate: refs.deactivate.getBoundingClientRect().width,
      });
    }
  }, []);

  const bg = showDeactivate
    ? 'var(--mm-danger-bg)'
    : isActive || hover ? 'var(--mm-btn-bg-hover)' : 'var(--mm-btn-bg)';
  const color = showDeactivate
    ? 'var(--mm-danger)'
    : isActive ? 'var(--mm-active-blue)' : hover ? 'var(--mm-text-primary)' : 'var(--mm-text-secondary)';
  const measured = widths ? widths[shown] : null;
  const labelStyle = (on: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    whiteSpace: 'nowrap',
    opacity: on ? 1 : 0,
    filter: on ? 'blur(0px)' : 'blur(2px)',
    transition: 'opacity 150ms ease-in-out, filter 150ms ease-in-out',
    pointerEvents: 'none',
  });

  return (
    <button
      onClick={isActive ? onDeactivate : onActivate}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="mm-press"
      style={{
        ...S.setActiveBtn,
        gap: 0,
        background: bg,
        color,
        transition: 'background 250ms cubic-bezier(0.23, 1, 0.32, 1), color 250ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
      }}
    >
      <span
        aria-hidden={true}
        style={{
          display: 'inline-flex', alignItems: 'center', overflow: 'hidden',
          width: showDeactivate ? 0 : 18,
          transition: 'width 250ms cubic-bezier(0.23, 1, 0.32, 1)',
          flexShrink: 0,
        }}
      >
        <Check
          size={12} strokeWidth={2.5}
          style={{
            marginRight: 6, flexShrink: 0,
            transform: showDeactivate ? 'scale(0)' : 'scale(1)',
            opacity: showDeactivate ? 0 : 1,
            transition: 'transform 250ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease-in-out',
          }}
        />
      </span>
      <span
        style={{
          position: 'relative',
          display: 'inline-block',
          height: '1em',
          width: measured !== null ? `${measured}px` : 'auto',
          transition: 'width 250ms cubic-bezier(0.23, 1, 0.32, 1)',
          verticalAlign: 'middle',
        }}
      >
        <span ref={el => { labelRefs.current.setActive = el; }} style={labelStyle(shown === 'setActive')}>Set active</span>
        <span ref={el => { labelRefs.current.active = el; }} style={labelStyle(shown === 'active')}>Active</span>
        <span ref={el => { labelRefs.current.deactivate = el; }} style={labelStyle(shown === 'deactivate')}>Deactivate</span>
      </span>
    </button>
  );
}

// ─── DropdownMenu (ED from bundle) ───────────────────────────────────────────
function DropdownMenu({ open, children }: { open: boolean; children: React.ReactNode }) {
  const mounted = useClosingPresence(open, 150);
  if (!mounted) return null;
  return (
    <div className="mm-dropdown" data-closing={open ? undefined : 'true'} style={S.dotsDropdown}>
      {children}
    </div>
  );
}

// ─── DotSelector (LD/$D from bundle) ─────────────────────────────────────────
const DOT_STYLE_ID = 'mm-dot-selector-styles';
const DOT_CSS = `
.mm-dot-row { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; }
.mm-dot-row > input.mm-dot-native { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.mm-dot-ring { display: inline-block; width: 16px; height: 16px; box-sizing: border-box; border-radius: 999px; border: 1.5px solid var(--mm-input-border); background: transparent; position: relative; transition: transform 80ms cubic-bezier(0.23, 1, 0.32, 1); flex: 0 0 auto; }
.mm-dot-ring::after { content: ''; position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; border-radius: 999px; background: var(--mm-text-primary); transform: translate(-50%, -50%) scale(0); transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1); }
.mm-dot-row:not(.mm-dot-disabled):hover .mm-dot-ring { transform: scale(1.05); }
.mm-dot-row:not(.mm-dot-disabled):active .mm-dot-ring { transform: scale(0.94); }
.mm-dot-input:checked ~ .mm-dot-ring::after { transform: translate(-50%, -50%) scale(1); transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.mm-dot-row.mm-dot-disabled { opacity: 0.4; }
.mm-dot-row.mm-dot-disabled .mm-dot-ring { transition: none; }
@media (prefers-reduced-motion: reduce) {
    .mm-dot-ring::after,
    .mm-dot-input:checked ~ .mm-dot-ring::after { transition: transform 120ms ease; }
}
`;
function ensureDotStyles() {
  if (typeof document === 'undefined' || document.getElementById(DOT_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = DOT_STYLE_ID;
  el.textContent = DOT_CSS;
  document.head.appendChild(el);
}

function DotSelector({ checked, onChange, disabled, label, id, name }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string; id?: string; name?: string;
}) {
  ensureDotStyles();
  return (
    <span className={`mm-dot-row${disabled ? ' mm-dot-disabled' : ''}`}>
      <input
        className="mm-dot-native mm-dot-input"
        type="checkbox"
        checked={checked}
        disabled={!!disabled}
        onChange={e => onChange(e.target.checked)}
        aria-label={label}
        id={id}
        name={name}
        data-testid="dot-selector"
      />
      <span className="mm-dot-ring" aria-hidden="true" />
    </span>
  );
}

// ─── KnowledgeSource (OD from bundle) ────────────────────────────────────────
function KnowledgeSource({ modeId, templateType, contract, loading, onSave }: {
  modeId: string; templateType: string; contract: any; loading: boolean;
  onSave: (params: { defaultOwner: string; allowedExplicitSwitches: string[] }) => Promise<any>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSourcesFor(templateType)));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contract || contract.origin !== 'user_selected') {
      setSelected(new Set(defaultSourcesFor(templateType)));
      return;
    }
    const switches = (contract.allowedExplicitSwitches as string[] ?? []).filter((s: string) => s !== 'transcript');
    setSelected(new Set(switches));
  }, [modeId, contract, templateType]);

  const handleToggle = async (value: string) => {
    if (saving || loading) return;
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    setSelected(next);
    setSaving(true);
    try { await onSave({ defaultOwner: 'reference_files', allowedExplicitSwitches: Array.from(next) }); }
    finally { setSaving(false); }
  };

  const sources = [
    { value: 'reference_files', label: 'Reference files' },
    { value: 'profile', label: 'Resume' },
    { value: 'job_description', label: 'Job description' },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={S.sectionLabel}>Knowledge source</h3>
      <div style={{ ...POLICY_CONTENT_BOX, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', cursor: 'default' }}>
        {sources.map(src => (
          <label key={src.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}>
            <DotSelector checked={selected.has(src.value)} onChange={() => handleToggle(src.value)} disabled={loading || saving} label={src.label} />
            <span style={{ fontSize: 12, color: 'var(--mm-text-primary)', lineHeight: 1.3 }}>{src.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── AnswerPolicyV3 (zD from bundle) ─────────────────────────────────────────
function AnswerPolicyV3({ modeId, templateType, state, onRefresh }: {
  modeId: string; templateType: string; state: any; onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);
  if (!state?.offered) return null;

  const opts = [
    { value: 'use_references_when_relevant', label: state.labels.use_references_when_relevant ?? 'use_references_when_relevant'.replace(/_/g, ' ') },
    { value: 'only_answer_from_references', label: state.labels.only_answer_from_references ?? 'only_answer_from_references'.replace(/_/g, ' ') },
  ];

  const set = async (policy: string) => {
    if (saving || policy === state.answerPolicy) return;
    setSaving(true);
    try {
      await (window as any).electronAPI?.answerPolicySet?.({ modeId, templateType, policy });
      onRefresh();
    } finally { setSaving(false); }
  };

  const isModeDefault = state.source === 'mode_default'
    || (state.source === 'user_choice'
      && typeof state.modeIsStrictByDefault === 'boolean'
      && state.answerPolicy === (state.modeIsStrictByDefault ? 'only_answer_from_references' : 'use_references_when_relevant'));

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={S.sectionLabel}>Answer policy</h3>
      <div style={{ ...POLICY_CONTENT_BOX, display: 'flex', flexDirection: 'column', gap: 10, padding: '12px' }}>
        {opts.map(opt => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1 }}>
            <DotSelector checked={state.answerPolicy === opt.value} onChange={() => set(opt.value)} />
            <span style={{ fontSize: 12, color: 'var(--mm-text-primary)', lineHeight: 1.3 }}>{opt.label}</span>
          </label>
        ))}
        {isModeDefault && (
          <span style={{ fontSize: 11, opacity: 0.6 }}>Using this mode's default.</span>
        )}
      </div>
    </div>
  );
}

// ─── WritingStyle (WD from bundle) ───────────────────────────────────────────
const MIN_SAMPLE_LEN = 40;

function writingStyleToast(res: any, okFallback?: string): { tone: 'ok' | 'danger'; text: string } | null {
  if (!res) return { tone: 'danger', text: 'Something went wrong. Try again.' };
  if (res.ok) {
    if (res.message) return { tone: 'ok', text: res.message };
    if (okFallback) return { tone: 'ok', text: okFallback };
    return null;
  }
  return { tone: 'danger', text: res.message || 'Something went wrong. Try again.' };
}

function WritingStyle({ modeId }: { modeId: string }) {
  const outputs = () => (window as any).electronAPI?.meetingOutputs;
  const [style, setStyle] = useState<WritingStyleInfo | null>(null);
  const [samples, setSamples] = useState<WritingSample[]>([]);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState<'add' | 'refresh' | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (toast?.tone !== 'ok') return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => () => { addedTimer.current && clearTimeout(addedTimer.current); }, []);

  const load = useCallback(async () => {
    const [s, smpls] = await Promise.all([
      outputs()?.getWritingStyle(modeId).catch(() => undefined),
      outputs()?.listWritingSamples(modeId).catch(() => undefined),
    ]);
    if (s) setStyle(s);
    if (smpls) setSamples(smpls);
    return smpls as WritingSample[] | undefined;
  }, [modeId]);

  useEffect(() => { load(); }, [load]);

  const addSample = async () => {
    setBusy('add');
    setToast(null);
    const prevIds = new Set(samples.map(s => s.id));
    const result = await outputs()?.addWritingSample(modeId, text).catch(() => undefined);
    setBusy(null);
    if (result?.ok) {
      setText('');
      setAdded(true);
      addedTimer.current && clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setAdded(false), 1400);
      const updated = await load();
      if (updated) setFreshIds(new Set(updated.filter((s: WritingSample) => !prevIds.has(s.id)).map((s: WritingSample) => s.id)));
    } else {
      setToast(writingStyleToast(result));
    }
  };

  const refreshStyle = async () => {
    setBusy('refresh');
    setToast(null);
    const result = await outputs()?.refreshWritingStyle(modeId).catch(() => undefined);
    setBusy(null);
    setToast(writingStyleToast(result, 'Your style is up to date.'));
    load();
  };

  const removeSample = async (id: string) => {
    const result = await outputs()?.removeWritingSample(modeId, id).catch(() => undefined);
    if (result) setStyle(result);
    load();
  };

  const placeholder = style && style.sampleCount > 0
    ? 'Paste another email or message you wrote yourself.'
    : 'Follow-up emails are drafted in your own voice once Natively has some of your writing. Paste a few emails you wrote, or edit a draft before you copy it.';
  const styleTitle = !style || style.sampleCount === 0 ? null : style.title || 'Style learned at your next follow-up';
  const statusText = toast?.text ?? styleTitle;
  const statusTitle = toast ? toast.text : style?.summary;
  const canSubmit = text.trim().length >= MIN_SAMPLE_LEN && !busy;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <h3 style={{ ...S.sectionLabel, marginBottom: 0 }}>Follow-ups in your style</h3>
        {style && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, margin: '-5px 0' }}>
            {style.sampleCount > 0 && (
              <button
                type="button"
                onClick={() => { void refreshStyle(); }}
                disabled={!!busy}
                className="mm-press mm-pill mm-pill--ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw size={12} className={busy === 'refresh' ? 'animate-spin' : undefined} />
                Update style
              </button>
            )}
          </div>
        )}
      </div>
      {style && (
        <>
          <div
            className="mm-input-box"
            style={{
              ...S.contentBox,
              minHeight: 160,
              flexDirection: 'column',
              alignItems: 'stretch',
              justifyContent: 'flex-start',
              padding: 0,
              cursor: 'auto',
              background: focused ? 'var(--mm-input-bg-focus)' : 'transparent',
              borderColor: focused ? 'var(--mm-input-border-focus)' : 'var(--mm-input-border)',
            }}
          >
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); if (toast?.tone === 'danger') setToast(null); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label="Paste something you wrote"
              placeholder={placeholder}
              style={{ ...S.textarea, flex: 1, minHeight: 56, resize: 'none', background: 'rgba(255, 255, 255, 0.02)' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--mm-input-border)' }}>
              <span
                role="status"
                aria-live="polite"
                title={statusTitle}
                style={{
                  flex: 1,
                  minWidth: 0,
                  paddingLeft: 4,
                  fontSize: 12,
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: toast?.tone === 'danger' ? 'var(--mm-danger)' : 'var(--mm-text-tertiary)',
                }}
              >
                {statusText}
              </span>
              <button
                type="button"
                onClick={() => { void addSample(); }}
                disabled={!canSubmit}
                className={canSubmit ? 'mm-press' : undefined}
                style={{ ...S.saveBtn, flexShrink: 0, opacity: canSubmit || added || busy === 'add' ? 1 : 0.35, cursor: canSubmit ? 'pointer' : 'default' }}
                onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = 'var(--mm-btn-bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
              >
                <MorphLabel
                  labels={{
                    add: 'Add sample',
                    adding: 'Adding…',
                    added: <><SavedCheck />Added</>,
                  }}
                  shown={busy === 'add' ? 'adding' : added ? 'added' : 'add'}
                />
              </button>
            </div>
          </div>
          {samples.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {samples.map(s => (
                <div
                  key={s.id}
                  data-sample-row
                  className={freshIds.has(s.id) ? 'mm-fresh-row' : undefined}
                  style={{ ...S.fileRow, gridTemplateColumns: '13px 1fr auto 20px' }}
                >
                  <PenLine size={13} style={{ color: 'var(--mm-text-secondary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--mm-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.preview}</span>
                  <span style={{ fontSize: 11, color: 'var(--mm-text-tertiary)', whiteSpace: 'nowrap' }}>
                    {s.source === 'followup' ? 'From a follow-up you edited' : 'Pasted'}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove sample"
                    onClick={e => {
                      const row = e.currentTarget.closest('[data-sample-row]') as HTMLElement | null;
                      collapseAndRun(row, () => { void removeSample(s.id); }, 6);
                    }}
                    className="mm-press-soft"
                    style={{ ...S.iconBtn, color: 'var(--mm-text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-text-tertiary)')}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--mm-text-tertiary)', lineHeight: 1.5, margin: '8px 0 0' }}>
            Samples stay on this computer. Your AI provider reads them only to describe your style.
          </p>
        </>
      )}
    </div>
  );
}

// ─── NotesTemplatePicker (MD from bundle) ────────────────────────────────────
function useClosingPresence(open: boolean, delay: number) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const timer = setTimeout(() => setMounted(false), delay);
    return () => clearTimeout(timer);
  }, [open, delay]);
  return open || mounted;
}

function MorphLabel({ labels, shown, align = 'center' }: { labels: Record<string, React.ReactNode>; shown: string; align?: 'center' | 'start' }) {
  const keys = Object.keys(labels);
  const refs = useRef<Record<string, HTMLSpanElement | null>>({});
  const [widths, setWidths] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    for (const key of keys) next[key] = refs.current[key]?.getBoundingClientRect().width ?? 0;
    setWidths(next);
  }, []);
  return <span className="mm-morph" data-align={align} style={{ width: widths[shown] }}>{'​'}{keys.map(key => <span key={key} ref={node => { refs.current[key] = node; }} className="mm-morph-label" data-shown={key === shown ? 'true' : undefined} aria-hidden={key === shown ? undefined : true}>{labels[key]}</span>)}</span>;
}

function TemplateTypeSelect({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const mounted = useClosingPresence(open, 150);
  const [highlight, setHighlight] = useState({ y: 0, h: 0, shown: false, placed: false });
  const [pressed, setPressed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const close = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setPicked(null);
    setHighlight(old => ({ ...old, shown: false, placed: false }));
    ((menu.current?.querySelector('[aria-selected="true"]') ?? menu.current?.querySelector('[role="option"]')) as HTMLElement | null)?.focus({ preventScroll: true });
    const outside = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close(); } };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const keys = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    const rows = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (!rows.length) return;
    const current = rows.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % rows.length;
    else if (event.key === 'ArrowUp') next = current <= 0 ? rows.length - 1 : current - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = rows.length - 1;
    else if (event.key === 'Tab') { setOpen(false); return; }
    if (next >= 0) { event.preventDefault(); rows[next].focus({ preventScroll: true }); }
  };
  const focusRow = (row: HTMLButtonElement) => {
    const selected = row.getAttribute('aria-selected') === 'true';
    const list = menu.current;
    if (!list) return;
    const rect = row.getBoundingClientRect();
    const y = rect.top - list.getBoundingClientRect().top - list.clientTop + list.scrollTop;
    setHighlight(old => ({ y, h: rect.height, shown: !selected, placed: old.placed || !selected }));
  };
  const pick = (next: string) => {
    if (picked !== null) return;
    if (next === value) { close(); return; }
    setPicked(next);
    setHighlight(old => ({ ...old, shown: false }));
    onChange(next);
    timer.current = setTimeout(close, 160);
  };
  const labels = Object.fromEntries(options.map(option => [option.value, option.label]));
  return <span ref={root} style={{ position: 'relative', display: 'inline-flex' }}>
    <button ref={trigger} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} onKeyDown={event => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setOpen(true); } }} className="mm-press-soft mm-tp-trigger" data-open={open ? 'true' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--mm-text-secondary)', background: undefined, border: '1px solid var(--mm-border, rgba(255,255,255,0.08))', borderRadius: 6, padding: '2px 5px 2px 6px', cursor: 'pointer', outline: 'none' }}><MorphLabel labels={labels} shown={value} align="start" /><span className="mm-nt-chevron" aria-hidden="true"><ChevronDown size={11} /></span></button>
    {mounted && <span ref={menu} role="listbox" className="mm-tp-menu" data-closing={open ? undefined : 'true'} style={{ display: 'block', position: 'absolute', top: 'calc(100% + 6px)', left: 0, transformOrigin: 'top left', background: 'var(--mm-bg)', border: '1px solid var(--mm-border)', borderRadius: 12, padding: 4, minWidth: 180, boxShadow: '0 12px 32px rgba(0,0,0,0.15)', zIndex: 100 }} onKeyDown={keys} onMouseLeave={() => setHighlight(old => ({ ...old, shown: false }))}>
      <span aria-hidden="true" className="mm-nt-highlight" data-shown={highlight.shown ? 'true' : undefined} data-placed={highlight.placed ? 'true' : undefined} data-pressed={pressed ? 'true' : undefined} style={{ display: 'block', transform: `translateY(${highlight.y}px)`, height: highlight.h }} />
      {options.map(option => { const selected = picked !== null ? picked === option.value : option.value === value; return <button key={option.value} type="button" role="option" aria-selected={selected} onClick={() => pick(option.value)} className="mm-nt-row" data-on={selected ? 'true' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 8px', border: 'none', borderRadius: 6, color: 'var(--mm-text-primary)', fontSize: 11, fontWeight: 500, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', outline: 'none', position: 'relative' }} onMouseEnter={event => event.currentTarget.focus({ preventScroll: true })} onFocus={event => focusRow(event.currentTarget)} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}><span style={{ flex: 1 }}>{option.label}</span>{selected && <svg className="mm-nt-check" data-draw={picked === option.value ? 'true' : undefined} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" pathLength="1" /></svg>}</button>; })}
    </span>}
  </span>;
}

function NotesTemplatePicker({ currentTitles, modeDefault, onPick }: {
  currentTitles: string[];
  modeDefault: { label: string; titles: string[] } | null;
  onPick: (templateId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const mounted = useClosingPresence(open, 150);
  const [highlight, setHighlight] = useState({ y: 0, h: 0, shown: false, placed: false });
  const [pressed, setPressed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const close = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setPicked(null);
    setHighlight(h => ({ ...h, shown: false, placed: false }));
    const target = (menu.current?.querySelector('[aria-checked="true"]') ?? menu.current?.querySelector('[role="menuitemradio"]')) as HTMLElement | null;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
    const outside = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close(); } };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const keys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    if (!rows.length) return;
    const current = rows.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % rows.length;
    else if (event.key === 'ArrowUp') next = current <= 0 ? rows.length - 1 : current - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = rows.length - 1;
    else if (event.key === 'Tab') { setOpen(false); return; }
    if (next >= 0) { event.preventDefault(); rows[next].focus(); }
  };
  const matches = (titles: string[]) => titles.length === currentTitles.length && titles.every((title, index) => title === currentTitles[index]);
  const focusRow = (row: HTMLButtonElement) => {
    const selected = row.getAttribute('aria-checked') === 'true';
    const list = menu.current;
    if (!list) return;
    const rect = row.getBoundingClientRect();
    const y = rect.top - list.getBoundingClientRect().top - list.clientTop + list.scrollTop;
    setHighlight(old => ({ y, h: rect.height, shown: !selected, placed: old.placed || !selected }));
  };
  const pick = (id: string, selected: boolean) => {
    if (picked) return;
    if (selected) { close(); return; }
    setPicked(id);
    setHighlight(old => ({ ...old, shown: false }));
    onPick(id);
    closeTimer.current = setTimeout(close, 160);
  };
  const row = (id: string, label: string, titles: string[]) => {
    const selected = picked ? picked === id : matches(titles);
    return <button key={id} type="button" role="menuitemradio" aria-checked={selected} onClick={() => pick(id, selected && !picked)} className="mm-nt-row" data-on={selected ? 'true' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px', border: 'none', borderRadius: 6, color: 'var(--mm-text-primary)', fontSize: 11, fontWeight: 500, cursor: 'pointer', textAlign: 'left', outline: 'none', position: 'relative' }} onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })} onFocus={e => focusRow(e.currentTarget)} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}>
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {selected && <svg className="mm-nt-check" data-draw={picked === id ? 'true' : undefined} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" pathLength="1" /></svg>}
    </button>;
  };
  return <div ref={root} style={{ position: 'relative', display: 'inline-flex' }}>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} className="mm-press-soft mm-nt-trigger" data-open={open ? 'true' : undefined} style={{ ...S.removeTplBtn, color: undefined, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{'Use a template'}<span className="mm-nt-chevron" aria-hidden="true"><ChevronDown size={12} /></span></button>
    {mounted && <div ref={menu} role="menu" aria-label="Note templates" className="mm-nt-menu" data-closing={open ? undefined : 'true'} style={{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, transformOrigin: 'bottom right', background: 'var(--mm-bg)', border: '1px solid var(--mm-border)', borderRadius: 12, padding: 4, width: 220, maxHeight: 320, overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,0.15)', zIndex: 100 }} onKeyDown={keys} onMouseLeave={() => setHighlight(old => ({ ...old, shown: false }))}>
      <div aria-hidden="true" className="mm-nt-highlight" data-shown={highlight.shown ? 'true' : undefined} data-placed={highlight.placed ? 'true' : undefined} data-pressed={pressed ? 'true' : undefined} style={{ transform: `translateY(${highlight.y}px)`, height: highlight.h }} />
      {modeDefault && <div><div style={{ padding: '4px 8px 4px', fontSize: 10.5, fontWeight: 500, color: 'var(--mm-text-tertiary)' }}>This mode</div>{row(MODE_DEFAULT_NOTE_TEMPLATE_ID, modeDefault.label, modeDefault.titles)}</div>}
      {NOTE_TEMPLATE_GROUPS.map((group, index) => <div key={group}><div style={{ padding: `${index === 0 && !modeDefault ? 4 : 10}px 8px 4px`, fontSize: 10.5, fontWeight: 500, color: 'var(--mm-text-tertiary)' }}>{group}</div>{NOTE_TEMPLATES.filter(template => template.group === group).map(template => row(template.id, template.name, template.sections.map(section => section.title)))}</div>)}
    </div>}
  </div>;
}

// ─── TemplatePicker (kD from bundle) ─────────────────────────────────────────
function TemplatePicker({ onSelect, onCreateEmpty }: {
  onSelect: (type: string) => void;
  onCreateEmpty: () => void;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      padding: '28px 32px', overflowY: 'auto',
    }}>
      <h2 className="mm-template-row" style={{
        fontSize: 22, fontWeight: 700, color: 'var(--mm-text-hero)',
        margin: 0, marginBottom: 6, animationDelay: '0ms',
      }}>
        Templates
      </h2>
      <p className="mm-template-row" style={{
        fontSize: 12, color: 'var(--mm-text-secondary)',
        margin: 0, marginBottom: 24, lineHeight: 1.5, animationDelay: '20ms',
      }}>
        Get started by selecting a template or start from an empty mode.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {TEMPLATES.map(t => (
          <button
            key={t.type}
            onClick={() => onSelect(t.type)}
            className="mm-template-row mm-press"
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 10,
              border: 'none', cursor: 'pointer', textAlign: 'left',
              transition: 'background 180ms var(--mm-ease-out), transform 160ms var(--mm-ease-out)',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: t.iconBg, color: t.iconColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <t.Icon size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mm-text-primary)' }}>{t.label}</span>
                <span className="mm-tpl-chevron" aria-hidden="true">
                  <ChevronRight size={13} style={{ color: 'var(--mm-text-tertiary)' }} />
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--mm-text-secondary)', margin: 0, lineHeight: 1.4 }}>
                {t.description}
              </p>
            </div>
          </button>
        ))}
      </div>
      <button
        onClick={onCreateEmpty}
        className="mm-press-soft"
        style={{
          marginTop: 16, alignSelf: 'flex-start',
          background: 'none', border: 'none',
          color: 'var(--mm-text-tertiary)', fontSize: 12, cursor: 'pointer',
          padding: '4px 0',
          transition: 'color 180ms var(--mm-ease-out), transform 140ms var(--mm-ease-out)',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-text-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-text-tertiary)')}
      >
        + Start from empty mode
      </button>
    </div>
  );
}

// ─── NoteSection form (GD from bundle) ──────────────────────────────────────
function NewSectionForm({ onConfirm, onCancel }: {
  onConfirm: (title: string, desc: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const esc = (e: React.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };

  return (
    <div className="mm-section-card" style={{
      border: '1px solid var(--mm-card-border)', borderRadius: 12,
      padding: '16px 20px', background: 'transparent', marginBottom: 8,
    }}>
      <input
        ref={ref}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(title, desc); } else esc(e); }}
        placeholder="Section title"
        style={{
          display: 'block', width: '100%', background: 'transparent',
          border: 'none', outline: 'none', fontSize: 15, fontWeight: 700,
          color: 'var(--mm-text-hero)', fontFamily: 'inherit', marginBottom: 6, padding: 0,
        }}
      />
      <input
        value={desc}
        onChange={e => setDesc(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(title, desc); } else esc(e); }}
        placeholder="Instructions for Natively"
        style={{
          display: 'block', width: '100%', background: 'transparent',
          border: 'none', outline: 'none', fontSize: 12,
          color: 'var(--mm-text-secondary)', fontFamily: 'inherit', padding: 0,
        }}
      />
    </div>
  );
}

// ─── NoteSection card (KD from bundle) ──────────────────────────────────────
function SectionCard({ section, fresh, collapseTo, onUpdateTitle, onUpdateDesc, onDelete }: {
  section: NoteSection;
  fresh?: boolean;
  collapseTo?: number;
  onUpdateTitle: (id: string, v: string) => void;
  onUpdateDesc: (id: string, v: string) => void;
  onDelete: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="mm-section-card"
      style={{
        border: `1px solid ${hover ? 'var(--mm-card-border-hover)' : 'var(--mm-card-border)'}`,
        borderRadius: 12, padding: '16px 20px',
        background: hover ? 'var(--mm-card-bg-hover)' : 'transparent',
        position: 'relative',
        transition: 'border-color 200ms var(--mm-ease-out), background 200ms var(--mm-ease-out)',
        ...(fresh ? { animationDelay: '0ms' } : {}),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineEdit
            value={section.title}
            onCommit={v => onUpdateTitle(section.id, v)}
            style={{ fontSize: 15, fontWeight: 700, color: 'var(--mm-text-hero)', display: 'block', lineHeight: 1.3, marginBottom: 5 }}
            inputStyle={{ fontSize: 15, fontWeight: 700 }}
          />
          <InlineEdit
            value={section.description || 'Click to add description'}
            onCommit={v => onUpdateDesc(section.id, v)}
            style={{ fontSize: 12, color: 'var(--mm-text-secondary)', lineHeight: 1.5, display: 'block' }}
            inputStyle={{ fontSize: 13 }}
          />
        </div>
        <button
          onClick={() => collapseAndRun(ref.current, () => onDelete(section.id), 8, collapseTo)}
          className="mm-press-soft"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--mm-text-tertiary)', padding: 2, display: 'flex', flexShrink: 0,
            opacity: hover ? 1 : 0, pointerEvents: hover ? 'auto' : 'none',
            transition: 'opacity 180ms cubic-bezier(0.23, 1, 0.32, 1), color 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-danger)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-text-tertiary)')}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// KnowledgeSource and AnswerPolicyV3 are defined above (gL/xL from bundle)

// ─── ProGate (rL from bundle — shown when !isPremium && !isTrialActive) ──────
function ProGate({ onOpenNativelyAPI, onClose }: {
  onOpenNativelyAPI?: () => void;
  onClose?: () => void;
}) {
  useEffect(() => {
    (window as any).electronAPI?.funnelTrack?.('paywall_hit', { feature: 'modes' })?.catch?.(() => {});
  }, []);

  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      height: '100%', background: 'var(--mm-bg)', overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '16px 20px', flexShrink: 0 }}>
        {onClose && (
          <button onClick={onClose} style={{ ...S.dotsBtn, background: 'none' }} aria-label="Close">
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36, maxWidth: 380 }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 34, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.1, color: 'var(--mm-text-hero)' }}>
            Every conversation.<br />A different expert.
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, color: 'var(--mm-text-secondary)', letterSpacing: '-0.01em' }}>
            Six dedicated AI modes tuned for the exact room you're in. Designed for professionals.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {TEMPLATES.slice(0, 6).map(t => (
            <div key={t.type} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 20,
              background: t.iconBg, border: `1px solid ${t.iconColor}33`,
            }}>
              <span style={{ color: t.iconColor, display: 'flex' }}><t.Icon size={14} /></span>
              <span style={{ fontSize: 12, fontWeight: 500, color: t.iconColor }}>{t.label}</span>
            </div>
          ))}
        </div>
        {onOpenNativelyAPI && (
          <button
            onClick={onOpenNativelyAPI}
            className="mm-press"
            style={{
              marginTop: 32, padding: '0 28px', height: 44, borderRadius: 22,
              background: 'var(--mm-active-blue)', border: 'none',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            Unlock Modes
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component (HD from bundle) ─────────────────────────────────────────
export default function ModesSettings({
  onClose,
  isPremium = false,
  isLoaded = false,
  isTrialActive = false,
  onOpenNativelyAPI,
}: {
  onClose?: () => void;
  isPremium?: boolean;
  isLoaded?: boolean;
  isTrialActive?: boolean;
  onOpenNativelyAPI?: () => void;
}) {
  const api = () => (window as any).electronAPI;
  const theme = useResolvedTheme();

  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const [loaded, setLoaded] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [context, setContext] = useState('');
  const [contextSaved, setContextSaved] = useState(true);
  const [contextFocused, setContextFocused] = useState(false);

  const [sourceContract, setSourceContract] = useState<any>(null);
  const [sourceContractLoading, setSourceContractLoading] = useState(false);
  const [answerPolicyState, setAnswerPolicyState] = useState<any>(null);

  const [refFiles, setRefFiles] = useState<ReferenceFile[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({});
  const [noteSections, setNoteSections] = useState<NoteSection[]>([]);
  const [okfKnowledgeUiEnabled, setOkfKnowledgeUiEnabled] = useState(false);
  const [editableCards, setEditableCards] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState<string | null>(null);
  const [knowledgeDetails, setKnowledgeDetails] = useState<Record<string, any>>({});
  const [knowledgeLoading, setKnowledgeLoading] = useState<Set<string>>(() => new Set());
  const [knowledgeBusy, setKnowledgeBusy] = useState<Set<string>>(() => new Set());
  const [expandedKnowledgeCardId, setExpandedKnowledgeCardId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [dotsOpen, setDotsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingSaveFailed, setPendingSaveFailed] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [lastPendingSwitch, setLastPendingSwitch] = useState<string | null>(null);
  if (pendingSwitch && pendingSwitch !== lastPendingSwitch) setLastPendingSwitch(pendingSwitch);
  const isLeaving = lastPendingSwitch === '__templates__' || lastPendingSwitch === '__new__';
  const pendingSaveFailedForCurrent = !!pendingSwitch && pendingSaveFailed === pendingSwitch;
  const [savingPending, setSavingPending] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptBoxRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [indicator, setIndicator] = useState({ top: 0, height: 0, visible: false, ready: false });
  const [isModeSwitch, setIsModeSwitch] = useState(false);
  const [savePulseKey, setSavePulseKey] = useState(0);
  const prevSavedRef = useRef(true);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const savedConfirmedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { savedConfirmedTimer.current && clearTimeout(savedConfirmedTimer.current); }, []);

  const [lastError, setLastError] = useState<string | null>(null);
  if (errorMsg && errorMsg !== lastError) setLastError(errorMsg);

  const [freshModes, setFreshModes] = useState<Set<string>>(() => new Set());
  const [freshItems, setFreshItems] = useState<Set<string>>(() => new Set());

  const [filesActionTriggered, setFilesActionTriggered] = useState(false);
  const filesBlock: 'list' | 'uploading' | 'empty' = refFiles.length > 0 ? 'list' : uploading ? 'uploading' : 'empty';
  const filesSwap = useSlotSwap(filesBlock, filesActionTriggered, selectedId);

  const [notesActionTriggered, setNotesActionTriggered] = useState(false);
  const notesBlock: 'empty' | 'list' = noteSections.length === 0 && !addingSection ? 'empty' : 'list';
  const notesSwap = useSlotSwap(notesBlock, notesActionTriggered, selectedId);
  const notesListRef = useRef<HTMLDivElement>(null);
  const [notesPanelAnim, setNotesPanelAnim] = useState(0);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [autoEditId, setAutoEditId] = useState<string | null>(null);

  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setFreshItems(new Set());
    setFilesActionTriggered(false);
    setNotesActionTriggered(false);
    setSavedConfirmed(false);
  }

  const unsavedRowRef = useRef<HTMLDivElement>(null);
  const shakeUnsaved = () => {
    const el = unsavedRowRef.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
    el.animate([
      { transform: 'translateX(0)', easing },
      { transform: 'translateX(6px)', easing, offset: 0.2857 },
      { transform: 'translateX(-6px)', easing, offset: 0.5714 },
      { transform: 'translateX(4px)', easing, offset: 0.7857 },
      { transform: 'translateX(0)' },
    ], { duration: 280 });
  };

  useEffect(() => {
    if (!dotsOpen) return;
    const outside = (e: MouseEvent) => {
      if (dotsRef.current && !dotsRef.current.contains(e.target as Node)) setDotsOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); setDotsOpen(false); }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); };
  }, [dotsOpen]);

  useEffect(() => {
    if (!pendingSwitch) return;
    const box = promptBoxRef.current;
    const scroller = box?.closest('.mm-cascade');
    if (box && scroller) {
      const boxRect = box.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      if (boxRect.top < scrollerRect.top || boxRect.bottom > scrollerRect.bottom) {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        scroller.scrollBy({
          top: boxRect.top - scrollerRect.top - 28,
          behavior: reduced ? 'auto' : 'smooth',
        });
      }
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        setPendingSwitch(null);
        textareaRef.current?.focus();
      }
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [pendingSwitch]);

  const mode = modes.find(m => m.id === selectedId) ?? null;
  const [defaultNoteSections, setDefaultNoteSections] = useState<Array<{ title: string; description: string }>>([]);
  const modeTemplateType = mode?.templateType;

  useEffect(() => {
    setDefaultNoteSections([]);
    if (!selectedId) return;
    let cancelled = false;
    Promise.resolve(api()?.modesGetDefaultNoteSections?.(selectedId))
      .then((defaults: any) => { if (!cancelled && Array.isArray(defaults)) setDefaultNoteSections(defaults); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, modeTemplateType]);

  const modeDefaultNoteTemplate = defaultNoteSections.length > 0 && modeTemplateType
    ? {
        label: modeTemplateType === 'general' ? 'General' : (TEMPLATE_MAP[modeTemplateType]?.label ?? 'Default'),
        titles: defaultNoteSections.map(s => s.title),
      }
    : null;

  useLayoutEffect(() => {
    if (showTemplates || !selectedId) {
      setIndicator(p => ({ ...p, visible: false }));
      return;
    }
    const el = rowRefs.current.get(selectedId);
    if (!el) { setIndicator(p => ({ ...p, visible: false })); return; }
    setIndicator(p => ({
      top: el.offsetTop,
      height: el.offsetHeight,
      visible: true,
      ready: p.ready || p.visible,
    }));
  }, [selectedId, showTemplates, modes]);

  useEffect(() => {
    if (prevSavedRef.current && !contextSaved) {
      setSavePulseKey(k => k + 1);
      setSavedConfirmed(false);
    }
    prevSavedRef.current = contextSaved;
  }, [contextSaved]);

  const loadModes = useCallback(async () => {
    try {
      const all: Mode[] = (await api()?.modesGetAll?.()) ?? [];
      setModes(all);
      setSelectedId(prev => (prev && all.find(m => m.id === prev) ? prev : all.find(m => m.isActive)?.id ?? all[0]?.id ?? null));
    } catch (err: any) {
      console.error('[ModesSettings] loadModes failed:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void loadModes(); }, [loadModes]);
  useEffect(() => {
    api()?.getIntelligenceFlags?.().then((flags: any[]) => {
      setOkfKnowledgeUiEnabled(Boolean(flags?.find(f => f.key === 'okfKnowledgeUi')?.enabled));
      setEditableCards(Boolean(flags?.find(f => f.key === 'okfUserEditableCards')?.enabled));
    }).catch(() => {
      setOkfKnowledgeUiEnabled(false);
      setEditableCards(false);
    });
  }, []);
  useEffect(() => {
    const unsubCleared = api()?.onModesActiveCleared?.(() => loadModes());
    return () => unsubCleared?.();
  }, [loadModes]);

  useEffect(() => {
    if (!selectedId) return;
    const m = modes.find(x => x.id === selectedId);
    if (m) { setContext(m.customContext ?? ''); setContextSaved(true); setContextFocused(false); }
  }, [selectedId, modes]);

  useEffect(() => {
    if (!selectedId) { setSourceContract(null); return; }
    let cancelled = false;
    setSourceContractLoading(true);
    api()?.modesGetSourceContract?.(selectedId)
      .then((c: any) => { if (!cancelled) setSourceContract(c); })
      .catch((err: any) => {
        console.error('[ModesSettings] modesGetSourceContract failed:', err);
        if (!cancelled) setSourceContract(null);
      })
      .finally(() => { if (!cancelled) setSourceContractLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const refreshAnswerPolicy = (mId: string, tpl: string) =>
    api()?.answerPolicyGet?.({ modeId: mId, templateType: tpl })
      .then((s: any) => { setAnswerPolicyState(s ?? null); })
      .catch(() => setAnswerPolicyState(null));

  useEffect(() => {
    const m = modes.find(x => x.id === selectedId);
    if (!m) { setAnswerPolicyState(null); return; }
    let cancelled = false;
    api()?.answerPolicyGet?.({ modeId: m.id, templateType: m.templateType })
      .then((s: any) => { if (!cancelled) setAnswerPolicyState(s ?? null); })
      .catch(() => { if (!cancelled) setAnswerPolicyState(null); });
    return () => { cancelled = true; };
  }, [selectedId, modes]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    Promise.all([
      api()?.modesGetReferenceFiles?.(selectedId),
      api()?.modesGetNoteSections?.(selectedId),
    ]).then(([files, sections]) => {
      if (cancelled) return;
      setRefFiles(files ?? []);
      setNoteSections(sections ?? []);
    }).catch(err => {
      if (!cancelled) console.error('[ModesSettings] panel load failed:', err);
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  const refreshFileStatus = useCallback(async (mId: string) => {
    try {
      const result = await api()?.modesGetReferenceFileStatus?.(mId);
      if (result?.success && result.statuses) {
        const map = Object.fromEntries(result.statuses.map((s: any) => [s.fileId, s.status]));
        setFileStatuses(prev => ({ ...prev, ...map }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void refreshFileStatus(selectedId);
    const unsub = api()?.onModeFileIndexStatus?.((data: any) => {
      if (data.modeId !== selectedId) return;
      if (data.phase === 'indexing' && data.fileId) {
        setFileStatuses(prev => ({ ...prev, [data.fileId]: 'indexing' }));
      } else {
        void refreshFileStatus(selectedId);
      }
    });
    return () => unsub?.();
  }, [selectedId, refreshFileStatus]);

  const saveContext = async (): Promise<boolean> => {
    if (!selectedId) return false;
    try {
      await api()?.modesUpdate?.(selectedId, { customContext: context });
      setContextSaved(true);
      setSavedConfirmed(true);
      savedConfirmedTimer.current && clearTimeout(savedConfirmedTimer.current);
      savedConfirmedTimer.current = setTimeout(() => setSavedConfirmed(false), 1400);
      setErrorMsg(null);
      setSaveFailed(false);
      void loadModes();
      return true;
    } catch (err: any) {
      console.error('[ModesSettings] saveContext failed:', err);
      setSaveFailed(true);
      return false;
    }
  };

  const commitSwitch = (target: string) => {
    setPendingSwitch(null);
    setErrorMsg(null);
    setSaveFailed(false);
    setPendingSaveFailed(null);
    if (target === '__new__') {
      void createEmpty();
    } else if (target === '__templates__') {
      setShowTemplates(true);
      setSelectedId(null);
    } else {
      setIsModeSwitch(true);
      setSelectedId(target);
      setShowTemplates(false);
    }
  };

  const discardAndSwitch = () => {
    if (!pendingSwitch) return;
    setContextSaved(true);
    commitSwitch(pendingSwitch);
  };

  const saveAndSwitch = async () => {
    const target = pendingSwitch;
    if (!target || savingPending) return;
    setSavingPending(true);
    const ok = await saveContext();
    setSavingPending(false);
    if (ok) commitSwitch(target);
    else setPendingSaveFailed(target);
  };

  const keepEditing = () => {
    setPendingSwitch(null);
    setPendingSaveFailed(null);
    textareaRef.current?.focus();
  };

  const selectMode = (id: string) => {
    if (!contextSaved && selectedId !== id) {
      if (pendingSwitch) shakeUnsaved();
      setPendingSwitch(id);
      return;
    }
    setIsModeSwitch(true);
    setSelectedId(id);
    setShowTemplates(false);
    setErrorMsg(null);
    setSaveFailed(false);
  };

  const handleKeyNav = (e: React.KeyboardEvent, id: string) => {
    if (e.target !== e.currentTarget) return;
    const ids = modes.map(m => m.id);
    const idx = ids.indexOf(id);
    let next: string | undefined;
    if (e.key === 'ArrowDown') next = ids[(idx + 1) % ids.length];
    else if (e.key === 'ArrowUp') next = ids[(idx - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMode(id); return; }
    else return;
    e.preventDefault();
    if (next) rowRefs.current.get(next)?.focus();
  };

  const renameMode = async (id: string, name: string) => {
    try {
      await api()?.modesUpdate?.(id, { name });
      setModes(prev => prev.map(m => m.id === id ? { ...m, name } : m));
    } catch (err: any) {
      console.error('[ModesSettings] renameMode failed:', err);
      setErrorMsg('Failed to rename mode.');
      void loadModes();
    }
  };

  const createFromTemplate = async (type: string) => {
    try {
      const tpl = TEMPLATES.find(t => t.type === type);
      const name = tpl?.label ?? 'New Mode';
      const result = await api()?.modesCreate?.({ name, templateType: type });
      if (result?.success && result.mode) {
        setFreshModes(s => new Set(s).add(result.mode.id));
        await loadModes();
        setSelectedId(result.mode.id);
        setShowTemplates(false);
        setErrorMsg(null);
      }
    } catch (err: any) {
      console.error('[ModesSettings] createMode failed:', err);
      setErrorMsg('Failed to create mode.');
    }
  };

  const createEmpty = async () => {
    try {
      const result = await api()?.modesCreate?.({ name: 'Untitled Mode', templateType: 'general' });
      if (result?.success && result.mode) {
        setFreshModes(s => new Set(s).add(result.mode.id));
        setAutoEditId(result.mode.id);
        await loadModes();
        setSelectedId(result.mode.id);
        setShowTemplates(false);
        setErrorMsg(null);
      }
    } catch (err: any) {
      console.error('[ModesSettings] createEmptyMode failed:', err);
      setErrorMsg('Failed to create mode.');
    }
  };

  const deleteMode = async (id: string) => {
    const remaining = modes.filter(m => m.id !== id);
    setModes(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
    try {
      await api()?.modesDelete?.(id);
    } catch (err: any) {
      console.error('[ModesSettings] deleteMode failed:', err);
      setErrorMsg('Failed to delete mode.');
      void loadModes();
    }
  };

  const activateMode = async (id: string) => {
    setModes(prev => prev.map(m => ({ ...m, isActive: m.id === id })));
    try {
      const result = await api()?.modesSetActive?.(id);
      if (result && result.success === false) {
        console.warn('[ModesSettings] setActive rejected:', result.error);
        setErrorMsg(result.error === 'pro_required'
          ? 'Activating this mode requires Natively Pro — the previous mode is still active.'
          : 'Failed to activate mode — the previous mode is still active.');
        void loadModes();
      }
    } catch (err: any) {
      console.error('[ModesSettings] setActive failed:', err);
      setErrorMsg('Failed to activate mode.');
      void loadModes();
    }
  };

  const deactivateMode = async () => {
    setModes(prev => prev.map(m => ({ ...m, isActive: false })));
    try {
      await api()?.modesSetActive?.(null);
    } catch (err: any) {
      console.error('[ModesSettings] deactivateMode failed:', err);
      setErrorMsg('Failed to deactivate mode.');
      void loadModes();
    }
  };

  const uploadFile = async () => {
    if (!selectedId || uploading) return;
    setUploading(true);
    setFilesActionTriggered(true);
    try {
      const result = await api()?.modesUploadReferenceFile?.(selectedId);
      if (result?.success && result.file) {
        setRefFiles(prev => [...prev, result.file]);
        setFreshItems(s => new Set(s).add(result.file.id));
        setModes(prev => prev.map(m => m.id === selectedId
          ? { ...m, referenceFileCount: m.referenceFileCount + 1 } : m));
        setErrorMsg(null);
        setFileStatuses(p => p[result.file.id] ? p : ({ ...p, [result.file.id]: 'pending' }));
      } else if (result && !result.cancelled) {
        console.error('[ModesSettings] uploadFile returned failure:', result);
        setErrorMsg(result.error === 'pro_required'
          ? 'Reference files require Pro.'
          : result.error ? `Failed to upload file: ${result.error}` : 'Failed to upload file.');
      }
    } catch (err: any) {
      console.error('[ModesSettings] uploadFile failed:', err);
      setErrorMsg(err?.message ? `Failed to upload file: ${err.message}` : 'Failed to upload file.');
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (fileId: string) => {
    setFilesActionTriggered(true);
    setRefFiles(prev => prev.filter(f => f.id !== fileId));
    setModes(prev => prev.map(m => m.id === selectedId ? { ...m, referenceFileCount: Math.max(0, m.referenceFileCount - 1) } : m));
    setKnowledgeDetails(prev => { const next = { ...prev }; delete next[fileId]; return next; });
    if (knowledgeOpen === fileId) setKnowledgeOpen(null);
    try {
      await api()?.modesDeleteReferenceFile?.(fileId);
    } catch (err: any) {
      console.error('[ModesSettings] deleteFile failed:', err);
      setErrorMsg('Failed to delete file.');
      void loadModes();
    }
  };

  const loadKnowledgePack = useCallback(async (fileId: string) => {
    setKnowledgeLoading(prev => { const next = new Set(prev); next.add(fileId); return next; });
    try {
      const result = await api()?.knowledgeGetPack?.(fileId);
      setKnowledgeDetails(prev => ({ ...prev, [fileId]: result?.pack ?? null }));
    } catch (error) {
      console.error('[ModesSettings] loadKnowledgePack failed:', error);
      setKnowledgeDetails(prev => ({ ...prev, [fileId]: null }));
    } finally {
      setKnowledgeLoading(prev => { const next = new Set(prev); next.delete(fileId); return next; });
    }
  }, []);

  const toggleKnowledge = (fileId: string) => {
    const next = knowledgeOpen === fileId ? null : fileId;
    setKnowledgeOpen(next);
    setExpandedKnowledgeCardId(null);
    if (next && !(next in knowledgeDetails)) void loadKnowledgePack(next);
  };

  const regenerateKnowledgePack = async (file: ReferenceFile) => {
    if (!selectedId) return;
    setKnowledgeBusy(prev => { const next = new Set(prev); next.add(file.id); return next; });
    try {
      const result = await api()?.knowledgeRegeneratePack?.({ fileId: file.id, modeId: selectedId, fileName: file.fileName });
      if (result?.success && result.pack) { setKnowledgeDetails(prev => ({ ...prev, [file.id]: result.pack })); setErrorMsg(null); }
      else if (result && !result.success) setErrorMsg(result.error ? `Failed to regenerate knowledge pack: ${result.error}` : 'Failed to regenerate knowledge pack.');
    } catch (error) {
      console.error('[ModesSettings] regenerateKnowledgePack failed:', error);
      setErrorMsg('Failed to regenerate knowledge pack.');
    } finally {
      setKnowledgeBusy(prev => { const next = new Set(prev); next.delete(file.id); return next; });
    }
  };

  const exportKnowledgePack = async (fileId: string) => {
    try {
      const result = await api()?.knowledgeExportPack?.(fileId);
      if (result && !result.success && !result.cancelled) setErrorMsg(result.error ? `Failed to export knowledge bundle: ${result.error}` : 'Failed to export knowledge bundle.');
    } catch (error) {
      console.error('[ModesSettings] exportKnowledgePack failed:', error);
      setErrorMsg('Failed to export knowledge bundle.');
    }
  };

  const updateKnowledgeCard = (fileId: string, card: any) => {
    setKnowledgeDetails(prev => {
      const pack = prev[fileId];
      return pack ? { ...prev, [fileId]: { ...pack, cards: pack.cards.map((entry: any) => entry.id === card.id ? { ...entry, ...card } : entry) } } : prev;
    });
  };
  const approveKnowledgeCard = async (fileId: string, cardId: string) => {
    try {
      const result = await api()?.knowledgeApproveCard?.(cardId);
      if (result?.success && result.card) updateKnowledgeCard(fileId, result.card);
      else if (result && !result.success) setErrorMsg(result.error ? `Failed to approve card: ${result.error}` : 'Failed to approve card.');
    } catch (error) { console.error('[ModesSettings] approveKnowledgeCard failed:', error); setErrorMsg('Failed to approve card.'); }
  };
  const rejectKnowledgeCard = async (fileId: string, cardId: string) => {
    try {
      const result = await api()?.knowledgeRejectCard?.(cardId);
      if (result?.success && result.card) updateKnowledgeCard(fileId, result.card);
      else if (result && !result.success) setErrorMsg(result.error ? `Failed to reject card: ${result.error}` : 'Failed to reject card.');
    } catch (error) { console.error('[ModesSettings] rejectKnowledgeCard failed:', error); setErrorMsg('Failed to reject card.'); }
  };

  const removeNotesTemplate = async () => {
    if (!selectedId) return;
    setNotesActionTriggered(true);
    setNoteSections([]);
    setNotesPanelAnim(k => k + 1);
    try {
      await api()?.modesRemoveAllNoteSections?.(selectedId);
    } catch (err: any) {
      console.error('[ModesSettings] removeNotesTemplate failed:', err);
      setErrorMsg('Failed to remove template.');
      void loadModes();
    }
  };

  const applyNoteTemplate = async (templateId: string) => {
    const id = selectedId;
    if (!id) return;
    setApplyingTemplate(true);
    try {
      const result = await api()?.modesApplyNoteTemplate?.(id, templateId);
      if (selectedIdRef.current !== id) return;
      if (result?.success && Array.isArray(result.sections)) {
        setNotesActionTriggered(true);
        setAddingSection(false);
        setNotesPanelAnim(k => k + 1);
        setNoteSections(result.sections);
      } else {
        setErrorMsg(result?.error === 'pro_required'
          ? 'Note templates need Natively Pro.'
          : 'Couldn’t use that template. Try again.');
      }
    } catch (err: any) {
      console.error('[ModesSettings] applyNoteTemplate failed:', err);
      setErrorMsg('Couldn’t use that template. Try again.');
    } finally {
      setApplyingTemplate(false);
    }
  };

  const updateSectionTitle = async (id: string, title: string) => {
    setNoteSections(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    try {
      await api()?.modesUpdateNoteSection?.(id, { title });
    } catch (err: any) {
      console.error('[ModesSettings] updateSectionTitle failed:', err);
      setErrorMsg('Failed to update section.');
    }
  };

  const updateSectionDesc = async (id: string, description: string) => {
    setNoteSections(prev => prev.map(s => s.id === id ? { ...s, description } : s));
    try {
      await api()?.modesUpdateNoteSection?.(id, { description });
    } catch (err: any) {
      console.error('[ModesSettings] updateSectionDesc failed:', err);
      setErrorMsg('Failed to update section.');
    }
  };

  const deleteSection = async (id: string) => {
    setNotesActionTriggered(true);
    setNoteSections(prev => prev.filter(s => s.id !== id));
    try {
      await api()?.modesDeleteNoteSection?.(id);
    } catch (err: any) {
      console.error('[ModesSettings] deleteSection failed:', err);
      setErrorMsg('Failed to delete section.');
    }
  };

  const firstTabId = !showTemplates && mode ? mode.id : modes[0]?.id;
  const isAllowed = isPremium || isTrialActive;

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (!isAllowed) {
    return (
      <div className="modes-manager-root" data-theme={theme} style={{ height: '100%' }}>
        <style>{CSS}</style>
        {isLoaded
          ? <ProGate onOpenNativelyAPI={onOpenNativelyAPI} onClose={onClose} />
          : <div aria-busy="true" style={{ height: '100%' }} />
        }
      </div>
    );
  }

  return (
    <div className="modes-manager-root" data-theme={theme}
      style={S.root}
      aria-busy={!loaded || uploading}
      data-genie-view={selectedId ?? undefined}
    >
      <style>{CSS}</style>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div style={S.sidebar}>
        {onClose && (
          <button
            onClick={onClose}
            className="mm-press-soft"
            style={S.closeBtn}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-text-tertiary)')}
            title="Close"
          >
            <X size={15} />
          </button>
        )}

        <div style={{ padding: '8px 20px 12px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--mm-text-hero)', margin: 0, letterSpacing: '0.01em', textTransform: 'uppercase' }}>
            Modes Manager
          </h2>
        </div>

        <div style={{ padding: '8px 12px 10px' }}>
          <LiquidGlassButton
            variant="clear"
            className="lg-sm lg-wide"
            style={{ width: '100%' }}
            onClick={() => {
              if (!contextSaved) {
                if (pendingSwitch) shakeUnsaved();
                setPendingSwitch('__new__');
                return;
              }
              void createEmpty();
            }}
            icon={<Plus size={13} />}
          >
            New Mode
          </LiquidGlassButton>
        </div>

        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Modes"
          style={{ flex: 1, overflowY: 'auto', padding: '2px 8px', position: 'relative' }}
        >
          <div
            aria-hidden="true"
            className="mm-sel-indicator"
            data-instant={!indicator.ready ? 'true' : undefined}
            style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height, opacity: indicator.visible ? 1 : 0 }}
          />

          {modes.map(m => {
            const selected = m.id === selectedId && !showTemplates;
            return (
              <div
                key={m.id}
                ref={el => { el ? rowRefs.current.set(m.id, el) : rowRefs.current.delete(m.id); }}
                role="tab"
                aria-selected={selected}
                tabIndex={m.id === firstTabId ? 0 : -1}
                className="mm-mode-item mm-press"
                onClick={() => selectMode(m.id)}
                onKeyDown={e => handleKeyNav(e, m.id)}
                style={{
                  ...S.modeItem, position: 'relative', zIndex: 1,
                  color: selected ? 'var(--mm-text-primary)' : 'var(--mm-text-secondary)',
                  ...(freshModes.has(m.id) ? { animationDelay: '0ms' } : {}),
                }}
              >
                <FileText
                  size={15}
                  style={{ flexShrink: 0, color: 'var(--mm-text-secondary)', fill: 'var(--mm-text-secondary)', fillOpacity: 0.2 }}
                />
                <InlineEdit
                  value={m.name}
                  onCommit={v => renameMode(m.id, v)}
                  disabled={isLockedGeneral(m)}
                  style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500, cursor: isLockedGeneral(m) ? 'inherit' : 'text' }}
                  inputStyle={{ fontSize: 13, fontWeight: 500 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {m.referenceFileCount > 0 && (
                    <span
                      title={`${m.referenceFileCount} reference file${m.referenceFileCount > 1 ? 's' : ''}`}
                      style={{ fontSize: 10, fontWeight: 600, color: 'var(--mm-text-tertiary)', background: 'var(--mm-btn-bg)', borderRadius: 10, padding: '1px 5px', lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 3 }}
                    >
                      <Paperclip size={9} />
                      {m.referenceFileCount}
                    </span>
                  )}
                  <ActiveCheck active={m.isActive} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: '1px solid var(--mm-border)', padding: '10px 8px' }}>
          <button
            onClick={() => {
              if (!contextSaved) {
                if (pendingSwitch) shakeUnsaved();
                setPendingSwitch('__templates__');
                return;
              }
              setShowTemplates(true);
              setSelectedId(null);
            }}
            className="mm-press-soft"
            style={S.templatesBtn}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-text-tertiary)')}
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, display: 'block' }}>
              <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.9" />
              <rect x="7.5" y="1" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.9" />
              <rect x="1" y="7.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.9" />
              <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.35" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Natively Templates</span>
          </button>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <div style={S.rightPanel}>
        {/* Error banner */}
        <BannerSlot open={!!errorMsg}>
          <div
            className="mm-banner"
            style={{
              padding: '6px 6px 6px 16px',
              background: 'var(--mm-btn-bg)', border: '1px solid var(--mm-btn-border)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--mm-danger)', lineHeight: 1.4 }}>
              {errorMsg ?? lastError}
            </span>
            <button
              onClick={() => setErrorMsg(null)}
              className="mm-press mm-pill mm-pill--ghost mm-pill--icon"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        </BannerSlot>

        {showTemplates || !mode ? (
          <div key="templates" className="mm-panel-content" style={{ height: '100%', minHeight: 0 }}>
            <TemplatePicker onSelect={createFromTemplate} onCreateEmpty={createEmpty} />
          </div>
        ) : (
          <div
            key={mode.id}
            className="mm-cascade"
            data-switch={isModeSwitch ? 'true' : undefined}
            style={{ padding: '28px 32px', overflowX: 'hidden', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}
          >
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
              <div style={{ minWidth: 0, flex: 1 }} key={`title-${mode.id}`}>
                <InlineEdit
                  value={mode.name}
                  onCommit={v => renameMode(mode.id, v)}
                  autoEdit={autoEditId === mode.id}
                  onEditEnd={() => setAutoEditId(null)}
                  disabled={isLockedGeneral(mode)}
                  style={{
                    fontSize: 28, fontWeight: 700, color: 'var(--mm-text-hero)',
                    lineHeight: 1.1, display: 'block',
                    cursor: isLockedGeneral(mode) ? 'inherit' : 'text',
                  }}
                  inputStyle={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: 'var(--mm-text-hero)', width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <ActivateBtn
                  isActive={mode.isActive}
                  onActivate={() => activateMode(mode.id)}
                  onDeactivate={deactivateMode}
                />
                {modes.length > 1 && !isLockedGeneral(mode) && (
                  <div ref={dotsRef} style={{ position: 'relative' }}>
                    <button
                      onClick={() => setDotsOpen(d => !d)}
                      className="mm-press-soft"
                      style={{ ...S.dotsBtn, background: dotsOpen ? 'var(--mm-btn-bg-hover)' : 'var(--mm-btn-bg)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--mm-btn-bg-hover)')}
                      onMouseLeave={e => { if (!dotsOpen) e.currentTarget.style.background = 'var(--mm-btn-bg)'; }}
                    >
                      <span style={{ letterSpacing: 1, fontSize: 14 }}>•••</span>
                    </button>
                    <DropdownMenu open={dotsOpen}>
                      <button
                        onClick={() => {
                          setDotsOpen(false);
                          const id = mode.id;
                          const rowEl = rowRefs.current.get(id) ?? null;
                          setIndicator(prev => ({ ...prev, visible: false }));
                          collapseAndRun(rowEl, () => { void deleteMode(id); });
                        }}
                        className="mm-press"
                        style={S.dotsDeleteBtn}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--mm-danger-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Trash2 size={14} style={{ color: 'var(--mm-danger)', flexShrink: 0 }} />
                        <span>Delete Mode</span>
                      </button>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </div>

            {/* Real-time prompt */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={S.sectionLabel}>Real-time prompt</h3>
              <div
                ref={promptBoxRef}
                className="mm-input-box"
                style={{
                  ...S.contentBox,
                  display: 'flex', flexDirection: 'column', padding: 0, minHeight: 200,
                  background: contextFocused ? 'var(--mm-input-bg-focus)' : 'transparent',
                  borderColor: pendingSwitch ? 'var(--mm-pending-border)' : contextFocused ? 'var(--mm-input-border-focus)' : 'var(--mm-input-border)',
                }}
                key={`prompt-${mode.id}`}
              >
                <textarea
                  ref={textareaRef}
                  value={context}
                  maxLength={8000}
                  onChange={e => { setContext(e.target.value); setContextSaved(false); setSaveFailed(false); }}
                  onFocus={() => { setContextFocused(true); setPendingSwitch(null); setPendingSaveFailed(null); }}
                  onBlur={() => setContextFocused(false)}
                  placeholder={contextPlaceholder(mode.templateType)}
                  style={{ ...S.textarea, flex: 1, minHeight: 120, background: 'rgba(255, 255, 255, 0.02)' }}
                />
                <div style={{ display: 'grid', alignItems: 'center', padding: '10px 12px', borderTop: '1px solid var(--mm-input-border)', width: '100%', boxSizing: 'border-box' }}>
                  {/* Normal save row */}
                  <div
                    className="mm-prompt-foot"
                    data-shown={pendingSwitch ? undefined : 'true'}
                    style={{ justifyContent: 'flex-end', gap: 8 }}
                  >
                    <span
                      role="status" aria-live="polite"
                      className="mm-save-fail"
                      data-shown={saveFailed ? 'true' : undefined}
                      style={{ flex: 1, minWidth: 0, paddingLeft: 4, fontSize: 12, color: 'var(--mm-danger)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {saveFailed ? 'Failed to save prompt. Please try again.' : ''}
                    </span>
                    <button
                      key={`save-${savePulseKey}`}
                      onClick={saveContext}
                      disabled={contextSaved}
                      className={contextSaved ? undefined : 'mm-press mm-save-pulse'}
                      style={{ ...S.saveBtn, opacity: contextSaved && !savedConfirmed ? 0.35 : 1, cursor: contextSaved ? 'default' : 'pointer' }}
                      onMouseEnter={e => { if (!contextSaved) e.currentTarget.style.background = 'var(--mm-btn-bg-hover)'; }}
                      onMouseLeave={e => { if (!contextSaved) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                    >
                      <MorphLabel
                        labels={{
                          save: 'Save',
                          saved: <><SavedCheck />Saved</>,
                        }}
                        shown={savedConfirmed ? 'saved' : 'save'}
                      />
                    </button>
                  </div>
                  {/* Unsaved-changes row */}
                  <div
                    ref={unsavedRowRef}
                    className="mm-prompt-foot"
                    data-shown={pendingSwitch ? 'true' : undefined}
                    role="group" aria-label="Unsaved changes"
                    style={{ gap: 8, paddingLeft: 4 }}
                  >
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--mm-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <MorphLabel
                        align="start"
                        labels={{
                          ask: isLeaving ? 'Save changes before leaving?' : 'Save changes before switching?',
                          failed: <span style={{ color: 'var(--mm-danger)' }}>Failed to save. Try again?</span>,
                        }}
                        shown={pendingSaveFailedForCurrent ? 'failed' : 'ask'}
                      />
                    </span>
                    <button onClick={keepEditing} className="mm-press mm-pill mm-pill--ghost">Keep editing</button>
                    <button onClick={discardAndSwitch} className="mm-press mm-pill mm-pill--danger">Discard</button>
                    <button onClick={() => { void saveAndSwitch(); }} disabled={savingPending} className="mm-press mm-pill mm-pill--primary">
                      {isLeaving ? 'Save & leave' : 'Save & switch'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Template type dropdown (non-locked modes only) */}
              {!mode.isBuiltin && (
                <p key={`subtitle-${mode.id}`} style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--mm-text-tertiary)', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Powered by Natively's built-in</span>
                  {isLockedGeneral(mode) ? <span>General</span> : (
                    <TemplateTypeSelect
                      value={mode.templateType}
                      options={[{ value: 'general', label: 'General' }, ...TEMPLATES.map(t => ({ value: t.type, label: t.label }))]}
                      onChange={async type => {
                        try {
                          const result = await api()?.modesUpdate?.(mode.id, { templateType: type });
                          if (result?.success) setModes(prev => prev.map(m => m.id === mode.id ? { ...m, templateType: type } : m));
                        } catch (err) {
                          console.error('[ModesSettings] template change failed:', err);
                        }
                      }}
                    />
                  )}
                  <span>intelligence.</span>
                </p>
              )}
            </div>

            {/* Knowledge source (OD) or answer policy v3 (zD) */}
            {answerPolicyState?.v3Enabled ? (
              <AnswerPolicyV3
                modeId={mode.id}
                templateType={mode.templateType}
                state={answerPolicyState}
                onRefresh={() => { void refreshAnswerPolicy(mode.id, mode.templateType); }}
              />
            ) : (
              <KnowledgeSource
                modeId={mode.id}
                templateType={mode.templateType}
                contract={sourceContract}
                loading={sourceContractLoading}
                onSave={async params => {
                  const built = await api()?.modesBuildUserSourceContract?.({
                    modeId: mode.id,
                    templateType: mode.templateType,
                    switches: params.allowedExplicitSwitches,
                  });
                  if (!built) return { success: false, error: 'failed_to_build_contract' };
                  const result = await api()?.modesUpdate?.(mode.id, { sourceContract: built });
                  if (result?.success) {
                    const fresh = await api()?.modesGetSourceContract?.(mode.id);
                    setSourceContract(fresh ?? null);
                  }
                  return result;
                }}
              />
            )}

            {/* Reference files */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={S.sectionLabel}>Reference files</h3>
              {refFiles.length === 0 && uploading ? (
                <div
                  className={filesSwap('uploading')}
                  style={{ ...S.contentBox, padding: '22px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
                  role="status"
                  key="uploading"
                >
                  <ThinkingOrb state="listening" size={64} speed={0.65} aria-hidden="true" />
                  <p style={{ fontSize: 12, color: 'var(--mm-text-secondary)', textAlign: 'center', margin: 0 }}>Adding your file…</p>
                </div>
              ) : refFiles.length === 0 ? (
                <div
                  className={filesSwap('empty')}
                  style={{ ...S.contentBox, padding: '22px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
                  key="empty"
                >
                  <p style={{ fontSize: 12, color: 'var(--mm-text-tertiary)', textAlign: 'center', margin: 0 }}>
                    Add files as real-time context.
                  </p>
                  <button
                    onClick={uploadFile}
                    className="mm-press"
                    style={S.uploadBtn}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--mm-btn-bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--mm-btn-bg)')}
                  >
                    <Paperclip size={13} />
                    <span>Upload file</span>
                  </button>
                </div>
              ) : (
                <div className={filesSwap('list')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }} key="list">
                  {refFiles.map(f => (
                    <React.Fragment key={f.id}>
                      <div
                        data-file-row
                        className={freshItems.has(f.id) ? 'mm-fresh-row' : undefined}
                        style={S.fileRow}
                      >
                        <FileText size={13} style={{ color: 'var(--mm-text-secondary)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--mm-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.fileName}
                        </span>
                        <ReferenceFileStatus status={fileStatuses[f.id]} fileName={f.fileName} />
                        <span style={{ fontSize: 11, color: 'var(--mm-text-tertiary)', flexShrink: 0, textAlign: 'right' }}>
                          {((f.content?.length ?? 0) / 1000).toFixed(1)}k
                        </span>
                        {okfKnowledgeUiEnabled && (
                          <button
                            onClick={() => toggleKnowledge(f.id)}
                            className="mm-press-soft"
                            title="Knowledge Pack"
                            style={{ ...S.iconBtn, color: knowledgeOpen === f.id ? 'var(--mm-text-primary)' : 'var(--mm-text-tertiary)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-text-primary)')}
                            onMouseLeave={e => (e.currentTarget.style.color = knowledgeOpen === f.id ? 'var(--mm-text-primary)' : 'var(--mm-text-tertiary)')}
                          >
                            <Sparkles size={12} />
                          </button>
                        )}
                        <button
                          onClick={e => {
                            const row = e.currentTarget.closest('[data-file-row]') as HTMLElement | null;
                            const next = row?.nextElementSibling;
                            if (next instanceof HTMLElement && next.hasAttribute('data-knowledge-panel')) {
                              collapseAndRun(next, () => {}, 6);
                            }
                            collapseAndRun(row, () => { void deleteFile(f.id); }, 6);
                          }}
                          className="mm-press-soft"
                          style={{ ...S.iconBtn, color: 'var(--mm-text-tertiary)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-danger)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-text-tertiary)')}
                        >
                          <X size={12} />
                        </button>
                      </div>
                      {okfKnowledgeUiEnabled && knowledgeOpen === f.id && (
                        <KnowledgePanel
                          file={f}
                          pack={knowledgeDetails[f.id]}
                          loading={knowledgeLoading.has(f.id)}
                          regenerating={knowledgeBusy.has(f.id)}
                          expandedCardId={expandedKnowledgeCardId}
                          onToggleCard={cardId => setExpandedKnowledgeCardId(current => current === cardId ? null : cardId)}
                          userEditableCardsEnabled={editableCards}
                          onApproveCard={cardId => void approveKnowledgeCard(f.id, cardId)}
                          onRejectCard={cardId => void rejectKnowledgeCard(f.id, cardId)}
                          onRegenerate={() => void regenerateKnowledgePack(f)}
                          onExport={() => void exportKnowledgePack(f.id)}
                        />
                      )}
                    </React.Fragment>
                  ))}
                  <button
                    onClick={uploadFile}
                    disabled={uploading}
                    className="mm-press-soft"
                    style={S.addFileBtn}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-text-tertiary)')}
                  >
                    <Plus size={12} />
                    <MorphLabel labels={{ idle: 'Add file', busy: 'Uploading…' }} shown={uploading ? 'busy' : 'idle'} align="start" />
                  </button>
                </div>
              )}
            </div>

            {/* Writing style (WD from bundle) */}
            <WritingStyle key={`ws-${mode.id}`} modeId={mode.id} />

            {/* Notes template */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 style={{ ...S.sectionLabel, margin: 0 }}>Notes template</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <NotesTemplatePicker
                    currentTitles={noteSections.map(s => s.title)}
                    modeDefault={modeDefaultNoteTemplate}
                    onPick={id => { void applyNoteTemplate(id); }}
                  />
                  {noteSections.length > 0 && (
                    <button
                      onClick={() => collapseAndRun(notesListRef.current, () => { void removeNotesTemplate(); }, 0, COLLAPSE_NOTES_MIN_HEIGHT)}
                      className="mm-press-soft"
                      style={S.removeTplBtn}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-text-primary)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-text-tertiary)')}
                    >
                      Remove template
                    </button>
                  )}
                </div>
              </div>

              {notesBlock === 'empty' ? (
                <div className={notesSwap('empty')} style={{ ...S.contentBox, minHeight: COLLAPSE_NOTES_MIN_HEIGHT }} key="empty">
                  <div style={S.autofillPlaceholder}>Autofilled by Natively</div>
                </div>
              ) : (
                <div
                  ref={notesListRef}
                  className={[notesSwap('list'), applyingTemplate ? 'mm-notes-applying' : undefined].filter(Boolean).join(' ') || undefined}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  key={`list-${notesPanelAnim}`}
                >
                  {noteSections.map(sec => (
                    <SectionCard
                      key={sec.id}
                      section={sec}
                      fresh={freshItems.has(sec.id)}
                      collapseTo={noteSections.length === 1 && !addingSection ? COLLAPSE_NOTES_MIN_HEIGHT : undefined}
                      onUpdateTitle={updateSectionTitle}
                      onUpdateDesc={updateSectionDesc}
                      onDelete={deleteSection}
                    />
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                {addingSection ? (
                  <NewSectionForm
                    onConfirm={async (title, desc) => {
                      if (!selectedId || !title.trim()) { setAddingSection(false); return; }
                      const result = await api()?.modesAddNoteSection?.(selectedId, title.trim(), desc.trim());
                      if (result?.success && result.section) {
                        setNoteSections(prev => [...prev, result.section]);
                        setFreshItems(s => new Set(s).add(result.section.id));
                      }
                      setAddingSection(false);
                    }}
                    onCancel={() => setAddingSection(false)}
                  />
                ) : null}
                <button
                  onClick={() => setAddingSection(true)}
                  className="mm-press"
                  style={{ ...S.addSectionBtn, marginTop: addingSection ? 10 : 0, border: '1px solid var(--mm-btn-border)', borderRadius: 20, padding: '6px 14px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-text-tertiary)')}
                >
                  <Plus size={13} />
                  <span>Add section</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
