export const id = 'settings-defaults';

// Review IPC behavior before expanding this allowlist. ContextBridge wrappers
// do not reliably expose the underlying function's arity.
const reads = [
  'getAiResponseLanguage', 'getAiResponseLanguages', 'getAmbiguousCredentialStores',
  'getAmbientChatEnabled', 'getAnswerLength', 'getAppleSpeechLocales', 'getArch',
  'getAutoAnswerAccess', 'getAutoAnswerEnabled', 'getAutoAnswerModelStatus',
  'getAvailableOllamaModels',
  'getCalendarReminderMinutes', 'getCalendarSources', 'getCalendarStatus', 'getCanAutoUpdate',
  'getCatchUpEnabled', 'getCloudFetchedModels', 'getCodeVerification', 'getCodexCliConfig',
  'getCodexCliModels', 'getContextDebugConfig', 'getCurrentLlmConfig', 'getCustomProviders',
  'getCustomRerankerModels', 'getDefaultModel', 'getDiagramsEnabled', 'getDictationEnabled',
  'getDirectAssistEnabled', 'getDisabledProviders', 'getDisguise', 'getDonationStatus',
  'getEmbeddingCatalog', 'getEmbeddingStatus', 'getFastModel', 'getFollowMeetingMute',
  'getGlobalShortcutsEnabled', 'getGroqFastTextMode', 'getHindsightConfig', 'getHindsightStatus',
  'getInputDevices', 'getIntelligenceContext', 'getIntelligenceFlags', 'getKeybindRegistrationFailures',
  'getKeybinds', 'getLastConnectionNotice', 'getLocalFallbackPreflight', 'getLocalFallbackStatus',
  'getLocalTrial', 'getLogFilePath', 'getMailAppInfo',
  'getMeetingActive', 'getMeetingAudioCapture', 'getMeetingAutoStartEnabled',
  'getMeetingAutoStopEnabled', 'getMeetingDetectionEnabled', 'getMeetingMuteState',
  'getMeetingOffer', 'getMeetingRetention', 'getMeetingSurface', 'getNativeAudioStatus',
  'getNativelyPlans', 'getNativelyUsage', 'getOpenAtLogin', 'getOsVersion', 'getOutputDevices',
  'getOverlayMousePassthrough', 'getOverlayUiState', 'getProviderDataScopes',
  'getProviderStatuses', 'getRecentMeetings', 'getRecognitionLanguages', 'getRerankerCatalog',
  'getRerankerHostedProviders', 'getRerankerStatus', 'getScreenshotDisplay', 'getScreenshots',
  'getScreenShareSnapshots', 'getScreenUnderstandingMode', 'getStealthShortcutGuard',
  'getSttLanguage', 'getSttProvider', 'getSyncedCalendars', 'getSystemAudioPermissionWarning',
  'getTechnicalInterviewDirectVision', 'getTechnicalInterviewVisionFirst', 'getThemeMode',
  'getTranscriptionPaused', 'getTrialStatus', 'getUndetectable', 'getUpcomingEvents',
  'getUsageStatistics', 'getUserDictionary', 'getVerboseLogging', 'isOllamaReachable',
  'isOverlayGroupDragManaged',
];

const skips = {
  getCalendarAttendees: 'requires an event ID',
  getAvailableLiteLLMModels: 'model discovery can persist a provider catalogue',
  getAvailableNinerouterModels: 'model discovery can persist a provider catalogue',
  getDiagnosticReportPreview: 'collects local diagnostic data',
  getNativelyPackKey: 'can return a credential suffix',
  getNativelyUpgradeLink: 'takes a plan family and fetches an account-specific link',
  getMeetingCalendarCandidates: 'requires a meeting ID',
  getMeetingDetails: 'requires a meeting ID',
  getMeetingNotesRating: 'requires a meeting ID',
  getMeetingNotesVersions: 'requires a meeting ID',
  getMeetingRecordingSpan: 'requires a meeting ID',
  getProviderStatus: 'requires a provider ID',
  getVisionModelStates: 'requires a list of model IDs',
  getStoredCredentials: 'returns credential data',
};

export async function run(app) {
  const page = app.windows.get('launcher');
  const methods = await page.evaluate(() => Object.keys(window.electronAPI).filter(
    (name) => /^(get|is|has)[A-Z]/.test(name) && typeof window.electronAPI[name] === 'function',
  ).sort());
  const values = {};
  const skipped = {};
  for (const name of methods) {
    if (!reads.includes(name)) {
      skipped[name] = skips[name] ?? 'IPC behavior or argument requirements have not been reviewed';
      continue;
    }
    try {
      values[name] = await page.evaluate(async (key) => {
        const value = await window.electronAPI[key]();
        return value === undefined ? { status: 'undefined' } : value;
      }, name);
    } catch (error) {
      values[name] = { status: 'error', message: error.message };
    }
  }
  return { values, skipped };
}
