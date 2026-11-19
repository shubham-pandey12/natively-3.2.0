# Phase 1 IPC diagnostic lists

The same lists were found in the local and installed builds. A static-listener entry is a scanner limit, not proof of an unused event.

## Handler without a preload key (44)

- `__e2e__:add-reference-file`
- `__e2e__:ask`
- `__e2e__:clear-profile`
- `__e2e__:context-os-benchmark-audit`
- `__e2e__:context-os-benchmark-audit-clear`
- `__e2e__:context-os-prompt-audit`
- `__e2e__:context-os-prompt-audit-clear`
- `__e2e__:detect-question`
- `__e2e__:dump-okf-cards`
- `__e2e__:enable-pro`
- `__e2e__:fail-live-embeds`
- `__e2e__:index-status`
- `__e2e__:ingest-profile-doc`
- `__e2e__:inject-transcript`
- `__e2e__:inspect-retrieval`
- `__e2e__:last-provider-model`
- `__e2e__:live-index-search`
- `__e2e__:manual-ask`
- `__e2e__:memory-probe`
- `__e2e__:prewarm-mode`
- `__e2e__:profile-state`
- `__e2e__:prompt-debug`
- `__e2e__:reindex-embeddings`
- `__e2e__:reset-session`
- `__e2e__:upload-reference-file-from-path`
- `center-and-show-window`
- `close-settings-window`
- `delete-curl-provider`
- `dev:thinking-budget-bench`
- `electron-store-get-data`
- `forward-log-to-file`
- `gemini-chat`
- `get-curl-providers`
- `get-ollama-models`
- `hide-model-selector`
- `invalidate-natively-usage-cache`
- `natively:preload-ready`
- `reset-queues`
- `restart-ollama`
- `save-curl-provider`
- `show-model-selector`
- `skills:reap-stages`
- `switch-to-curl-provider`
- `switch-to-custom-provider`

## Preload listener without a recognized send (39)

- `codex:login:complete`
- `codex:login:failed`
- `codex:signed-out`
- `codex:tokens:refreshed`
- `debug-error`
- `debug-start`
- `debug-success`
- `diagram:render-request`
- `embedding:incompatible-provider-warning`
- `embedding:model-progress`
- `embedding:reindex-complete`
- `embedding:reindex-progress`
- `embedding:reindex-started`
- `initial-start`
- `intelligence-clarify-token`
- `intelligence-dynamic-action-retract`
- `intelligence-follow-up-questions-token`
- `intelligence-recap-token`
- `intelligence-refined-answer-token`
- `intelligence-suggested-answer-token`
- `keybinds:registration-failed`
- `local-whisper-download-complete`
- `local-whisper-download-error`
- `local-whisper-download-progress`
- `native-audio-connected`
- `native-audio-disconnected`
- `native-audio-suggestion`
- `onboarding:tour-shortcut`
- `problem-extracted`
- `procesing-unauthorized`
- `processing-no-screenshots`
- `reranker:model-progress`
- `reset-view`
- `solution-error`
- `solution-success`
- `solutions-ready`
- `suggestion-error`
- `suggestion-generated`
- `suggestion-processing-start`

## Unresolved non-literal expression kinds (17)

- `handle|ipcMain.handle|channel`
- `on|ipcMain.on|channel`
- `send|broadcast|channel`
- `send|mainWindow.webContents.send|this.appState.PROCESSING_EVENTS.DEBUG_ERROR`
- `send|mainWindow.webContents.send|this.appState.PROCESSING_EVENTS.DEBUG_START`
- `send|mainWindow.webContents.send|this.appState.PROCESSING_EVENTS.DEBUG_SUCCESS`
- `send|mainWindow.webContents.send|this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR`
- `send|mainWindow.webContents.send|this.appState.PROCESSING_EVENTS.INITIAL_START`
- `send|mainWindow.webContents.send|this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS`
- `send|mainWindow.webContents.send|this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED`
- `send|mainWindow.webContents.send|this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS`
- `send|sendToWindow|channel`
- `send|sender.send|channel`
- `send|this._sender.send|data || EMPTY_BUFFER`
- `send|w2.webContents.send|channel`
- `send|win.webContents.send|\`codex:${event}\``
- `send|win.webContents.send|channel`

The 46 unique non-literal expression kinds match between builds; 29 are statically resolved constants and 17 remain unresolved. Raw occurrences differ because esbuild repeats embedded modules.
