# Phase 7: phone mirror and calendar parity (F071–F078)

## Method

Built local output in the required `electron → renderer → electron` order. Compared the local and signed 3.2.0 `dist-electron/electron/main.js` as Latin-1, splitting on esbuild `// <path>` module headers. Bundle checks used `diff -a` and file sizes. Compared separately emitted service files and the renderer chunks by basename without hash; tokenized JavaScript string and template literals with Acorn. The reference was read only and never loaded. The code-review-graph MCP tools were unavailable (none exposed), so source and bundle inspection provided the fallback. IPC equality is recorded in [phase7-ipc.md](phase7-ipc.md).

Reference anchors are line numbers in `ref-3.2.0/asar/dist-electron/electron/main.js`: `phoneMirrorClient.ts:43071`, `CalendarManager.ts:200757`, `PhoneMirrorService.ts:208961`, `microsoftGraph.ts:198821`, `MicrosoftCalendarProvider.ts:199002`, `registry.ts:200045`, `calendarReminderPlan.ts:200130`, `meetingOffer.ts:200168`, `loopbackOAuth.ts:194320`, `connectionsStore.ts:192704`, `connectorOAuth.ts:194437`. These module headers plus the local source lines below establish both-side evidence.

## Module and shipped-file comparison

| Bundle/scope | Identical | Rename-only | Real difference | Missing/extra |
|---|---:|---:|---:|---:|
| Main: phone mirror, calendar/OAuth, meeting detection, connections/extension modules | 42 | 16 | 3 | 0/0 |
| Standalone `PhoneMirrorService.js` scoped modules | 25 | 1 | 2 | 0/0 |

Every real-difference module received a Latin-1 unified diff. `meetingDetection/callFacts.ts` changes only bundler-numbered identifiers (`app47`/`app46`, `COUNT_WORDS`/`COUNT_WORDS2`); regex text and behavior match, so this is rename-only on closer inspection. `CalendarManager.ts` changes bundler-numbered Electron import identifiers and the intentionally held Google client-secret default. `microsoftGraph.ts` changes only the intentionally held baked Microsoft client ID. The two standalone PhoneMirrorService differences repeat these calendar holds through bundled imports. No behavior gap outside F103 was found; no value from either hold is reproduced here.

Standalone `.js` checks: `phoneMirrorClient.js`, `phoneMirrorLiveAnswers.js`, `phoneMirrorMarkdown.js`, `connectionsStore.js`, `calendarReminderPlan.js`, `calendarSessionMatch.js`, `calendarConnectionBroadcast.js`, Apple/ICS calendar providers, loopback OAuth, event-shape and secure-file modules match byte for byte. `PhoneMirrorService.js`, `CalendarManager.js`, `SessionCalendarLinker.js`, `MicrosoftCalendarProvider.js`, `microsoftGraph.js`, and `registry.js` differ because the held credentials are bundled into those outputs; the remaining module bodies were covered by the split comparison. The served phone HTML/CSS/JS is the `PHONE_MIRROR_HTML` template in [phoneMirrorClient.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/phoneMirrorClient.ts:1), whose standalone JS is byte identical to 3.2.0. No separate phone web asset is missing.

## Exact data and configuration

The corresponding reference module bodies match except for the stated holds, so these emitted values and algorithms agree on both sides.

| Contract | Local evidence and matching reference module |
|---|---|
| Listener/pairing | [PhoneMirrorService.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/PhoneMirrorService.ts:165): port 4123 with 12-port probe range; `127.0.0.1` when LAN is off and `0.0.0.0` when explicitly on (lines 1487–1519). Fresh 24-byte phone token per session; separate persisted extension token; phone URL/QR shape `http://<host>:<port>/?t=<token>` (lines 255–263, 1429–1444). Extension `/pair` arm lasts 60 seconds (line 202). Tokens and pairing codes were neither displayed nor logged in this report. |
| Stream/tray/chat | [PhoneMirrorService.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/PhoneMirrorService.ts:167): history 40, live transcript 80 segments/12,000 chars, live-answer render at most every 120 ms, eight live streams, tray five, remembered screenshots 24, image history 1,200,000 chars; upload cap 12 MiB. [phoneMirrorClient.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/phoneMirrorClient.ts:3429): 2048-pixel image long edge, 640-pixel JPEG thumbnail at quality 0.72, four images per picker. This is text/answer and screenshot mirroring, not a continuous screen-video stream; a video frame rate is inapplicable. |
| Google OAuth | [CalendarManager.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/CalendarManager.ts:54): Google auth/token URLs, `openid`, userinfo email/profile, `calendar.events.readonly`, `calendar.calendarlist.readonly`; max 20 synced calendars. PKCE loopback binds `127.0.0.1` on OS-assigned port (lines 319–371), with matching redirect URI. Token refresh and encrypted persistence paths match except the held client secret. |
| Outlook OAuth/Graph | [microsoftGraph.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/calendar/providers/microsoftGraph.ts:26): Graph v1.0, scopes `Calendars.Read`, `offline_access`, `User.Read`. `/me/calendarView` uses `$top=100`, start/date order, and the identical `GRAPH_EVENT_FIELDS` list at lines 123–138; `/me` requests display name/mail/UPN in `MicrosoftCalendarProvider.ts:217`. Loopback OAuth uses an assigned port on `127.0.0.1` and, where available, `::1` (`loopbackOAuth.ts:120–133`). The baked client ID is a deliberate hold. |
| Sync/reminders/filters | [calendarReminderPlan.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/calendar/calendarReminderPlan.ts:16): background refresh every five minutes, two-minute freshness gate, last-good fallback up to 24 hours. [meetingOffer.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/meetingDetection/meetingOffer.ts:392): reminder choices 0/1/2/5 minutes, default two; declined events skipped, 60-second drift tolerance, closes five minutes after start. Google filters all-day and under-five-minute events (`CalendarManager.ts:1043`); Graph filters all-day, cancelled, and under-five-minute events (`microsoftGraph.ts:167`). |
| Platforms | [registry.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/calendar/providers/registry.ts:20) selects Google/Outlook/Apple/ICS on darwin and Google/Outlook/ICS on win32. [CalendarSettings.tsx](/Users/shubhampandey/testing/natively-cluely-ai-assistant/src/components/settings/CalendarSettings.tsx:169) only exposes Apple privacy instructions on macOS. The shared phone HTTP/WebSocket listener has no OS-specific branch. |

## Renderer literal comparison

All 77 renderer chunk basenames are present locally and in the reference: 67 byte identical, 10 byte different. Acorn tokenization of `App.js`, `NativelyInterface.js`, and `AuxRoot.js` gave **zero phone/calendar/connections literal differences** in the latter two. In `App.js`, the scope-filtered set differences are held plan/trial wording (`F012/F099/F100`) and one local `mirror` animation literal, not phone mirror UI text. No missing pairing, calendar, or connector label was found. The remaining raw minified chunk differences are identifiers and held content, so they were not treated as UI text gaps.

## Isolated macOS runtime

Ran `agent-browser skills get core`, `agent-browser skills get electron`, `npm run dev:agent`, then `AGENT_BROWSER_CONFIG=$PWD/agent-browser.json agent-browser tab/eval/snapshot/console/errors`. Confirmed `location.search === '?window=launcher'` before each snapshot. Console and errors were captured in `/private/tmp/phase13-console.txt` and `/private/tmp/phase13-errors.txt` (scratch only). No real phone, extension, or calendar account was paired or signed in.

| Feature | Observed result |
|---|---|
| F071 Pairing | Phone Mirror was off, LAN off. Temporarily enabled it; main log reported `[PhoneMirror] listening on 127.0.0.1:4123 (lan=false)`. UI showed Pair a phone, Show code, Reset pairing, and extension pairing controls. Did not reveal the code or token. Switched Phone Mirror back off; LAN remained off. |
| F072 Stream | No phone connected; live answer/transcript stream reviewed in identical service and phone-page code. |
| F073 Screenshot tray | No phone connected; five-item tray and image limits reviewed statically. |
| F074 Chat | No phone connected; message/history controls reviewed statically. |
| F075 Google Calendar | Calendar tab showed Google disconnected and a Connect action; no OAuth started. Local build has held empty secret, so live sign-in is unavailable. |
| F076 Outlook Calendar | Calendar tab said “Outlook · Not available in this version yet”; Connect disabled. Local build has held empty client ID. |
| F077 Meeting start | Launcher showed “Link your calendar to see upcoming events”; no synced upcoming events. Calendar settings showed Detect meetings on, Start automatically off, End when call ends on. Trigger/reminder rules reviewed statically, not fired. |
| F078 Connections | Connectors tab listed Gmail, Slack, Notion, CRM, Zapier, webhooks, and an off MCP endpoint. Phone tab showed “Connect browser extension”; no extension pairing action was taken. |

The only setting changed was Enable Phone Mirror, restored to off. The app was stopped through launcher **Quit Natively**. No credentials or user records were changed.

## Holds, fixes, validation, risks

F103 is Held: the local Google client-secret default and Outlook baked client ID are intentionally empty. The reference contains values, which were not copied or reported. No other proven behavior gap emerged, so no source fix or new test was made. The existing [phase7-ipc.md](phase7-ipc.md) covers IPC registrations.

`npm run build:electron && npm run build && npm run build:electron` passed; `npm run typecheck:electron` passed. Selected phone mirror/calendar tests passed 77/77. `CalendarSources2026_10_15.test.mjs` and `CalendarOutlook2026_10_15.test.mjs` explicitly exercise injected `darwin` and `win32` branches. Physical phone pairing and live Google/Outlook OAuth remain untested on both operating systems; Windows listener/firewall and callback behavior require physical Windows verification. No packaging/signing or Windows installer was built. This report is ignored under the existing `.gitignore:512` rule; `.gitignore` was not changed in this phase.
