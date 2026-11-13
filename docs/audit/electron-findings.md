# Electron, IPC and answer presentation

Reviewed preload and IPC registration, request/event identity, renderer resets and subscriptions, development window security and platform branches. Existing renderer diagnostics and error boundaries are visible in source. Physical permissions, focus, crash recovery, frozen renderer behavior and listener counts were not measured. [Window setup](../../electron/WindowHelper.ts#L558), [Windows overlay](../../electron/WindowHelper.ts#L985), [renderer diagnostics](../../src/main.tsx#L17), [permissions](../../electron/ipcHandlers.ts#L19550).

See the [audit scope and validation](executive-summary.md). Shared TypeScript findings apply to the inspected path on either OS. Native behavior is identified per backend where relevant. Physical execution is unverified.

## AUD-UI-001 — Fresh session reset leaves Direct Assist history populated

- **Severity / confidence** — High / Confirmed.
- **Source and functions** — [NativelyInterface session reset subscription](../../src/components/NativelyInterface.tsx#L5598), [resume-only history assignment](../../src/components/NativelyInterface.tsx#L5700), [beginDirectAssist history payload](../../src/components/NativelyInterface.tsx#L7440), [Direct Assist IPC request](../../electron/ipcHandlers.ts#L8500).
- **Implementation evidence** — The persistent renderer clears visible messages on reset. It assigns Direct history only if resumed messages exist. Successful Direct turns populate the ref and the next Direct request forwards its tail.
- **Root cause** — Fresh reset never assigns an empty Direct history. Session isolation differs between visible and request state.
- **Interview example** — Finish an interview where Direct Assist answered about company A. Start a fresh interview for company B and ask a related question.
- **User impact** — Previous interview context can influence the new answer. Provider scope rules still apply, so this does not establish unauthorized cloud disclosure.
- **Reproduction** — Source-derived. Complete a Direct turn with a unique sentinel, issue fresh session-reset, inspect the next Direct IPC payload. Then compare explicit resume. Electron execution unverified.
- **Existing test coverage** — [resumedChat](../../src/lib/__tests__/resumedChat2026_11_03.test.mjs#L57) checks hydration and [Direct renderer](../../src/lib/__tests__/directAssistRenderer2026_08_29.test.mjs#L222) checks append. Neither demonstrates fresh reset clears the ref.
- **Recommended fix** — Always replace history on reset, with empty history for fresh sessions. Add isolated fresh and resumed behavioral cases.

## AUD-UI-002 — Direct Assist request ownership can survive the session reset event

- **Severity / confidence** — High / Potential risk.
- **Source and functions** — [NativelyInterface session reset](../../src/components/NativelyInterface.tsx#L5598), [onDirectAssistEvent](../../src/components/NativelyInterface.tsx#L7144), [main Direct controller registration](../../electron/ipcHandlers.ts#L8433), [overlay stream guards](../../src/components/NativelyInterface.tsx#L7862).
- **Implementation evidence** — Reset cancels legacy chat but does not retire the Direct request ref. Direct callbacks match request ID rather than session. Main aborts on replacement, explicit cancel or sender destruction. The overlay can be reused, and legacy handlers can return early while Direct stays active.
- **Root cause** — Reset and Direct ownership are separate. Which events visibly commit after Stop/Start needs a real renderer trace.
- **Interview example** — Stop while Direct is streaming, then start a new session before it completes.
- **User impact** — Late Direct activity can keep other answer paths suppressed or mutate new-session state.
- **Reproduction** — Proposed. Hold fake Direct tokens and done until after both stop/start reset events. Inspect loading, placeholder rows, legacy answer events and context history.
- **Existing test coverage** — [Direct renderer](../../src/lib/__tests__/directAssistRenderer2026_08_29.test.mjs#L147) checks ID/sequence and competing streams. [Overlay reset collapse](../../src/lib/__tests__/overlaySessionResetCollapse.test.mjs) checks layout. Neither establishes late Direct events across session boundaries.
- **Recommended fix** — Invalidate and cancel Direct on reset, retire reveal state and gate main and renderer events by owning session.

## AUD-ELC-001 — Direct IPC checks sender identity without establishing surface ownership

- **Severity / confidence** — Medium / Potential risk.
- **Source and functions** — [initializeIpcHandlers](../../electron/ipcHandlers.ts#L334), [direct-assist-stream](../../electron/ipcHandlers.ts#L8364), [sender ID guard](../../electron/ipcHandlers.ts#L8397), [screenshot retry sender check](../../electron/ipcHandlers.ts#L1647), [preload bridge](../../electron/preload.ts#L1587).
- **Implementation evidence** — The handler validates shape and uses finite sender ID to key streams. It does not check that sender against a permitted window at this boundary. The screenshot retry handler illustrates a separate sender authorization pattern.
- **Root cause** — Trust scope is broad at this call site. A renderer compromise, unauthorized access or exploit was not demonstrated.
- **Interview example** — An unintended renderer can invoke a provider request if it has the bridge and Direct is enabled.
- **User impact** — Potential provider work or session context use from an unexpected surface.
- **Reproduction** — Proposed. In an isolated fixture, invoke valid Direct requests from each window type and assert the intended sender matrix and context scope. Use stub providers.
- **Existing test coverage** — [IpcBridgeWiring](../../electron/services/__tests__/IpcBridgeWiring.test.mjs) checks channel reachability. [IpcOnIdempotency](../../electron/audio/__tests__/IpcOnIdempotency.test.mjs) passed source checks for listener registration. Neither proves sender policy.
- **Recommended fix** — Document authorized surfaces, add runtime authorization where needed and test denied requests before loading attachments or transcript.
