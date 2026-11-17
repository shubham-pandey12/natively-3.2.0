export const PACK_LICENCE_PLANS = new Set(['pack_light', 'pack_heavy']);
export const isPackLicence = (provider: string | null | undefined, plan: string | null | undefined): boolean =>
  provider === 'natively_api' && typeof plan === 'string' && PACK_LICENCE_PLANS.has(plan);
const aiOnNatively = (model: string | null | undefined, fastFamily: string | null | undefined): boolean =>
  model === 'natively' && (fastFamily == null || fastFamily === 'natively');
export function packProBlock(f: { licenceProvider?: string | null; licencePlan?: string | null; defaultModel?: string | null; fastFamily?: string | null; sttProvider?: string | null }): 'both' | 'ai' | 'stt' | null {
  if (!isPackLicence(f.licenceProvider, f.licencePlan)) return null;
  const aiOff = !aiOnNatively(f.defaultModel, f.fastFamily);
  const sttOff = f.sttProvider !== 'natively';
  return aiOff && sttOff ? 'both' : aiOff ? 'ai' : sttOff ? 'stt' : null;
}
export const packHoursCount = (model: string | null | undefined, sttProvider: string | null | undefined, fastFamily: string | null = null): boolean =>
  aiOnNatively(model, fastFamily) && sttProvider === 'natively';
export async function restoreAfterPackStandDown(d: {
  proActive(): boolean; knowledgeSetting(): boolean; knowledgeSwitchedOn(): boolean; setKnowledge(on: boolean): void;
  savedModeId(): string | null; clearSavedModeId(): void; packLicence(): boolean; activeModeId(): string | null;
  modeExists(id: string): boolean; applyMode(id: string): Promise<{ success?: boolean }>;
}): Promise<{ knowledge: boolean; modeId: string | null }> {
  const done = { knowledge: false, modeId: null as string | null };
  try {
    if (!d.proActive()) return done;
    if (d.knowledgeSetting() && !d.knowledgeSwitchedOn()) { d.setKnowledge(true); done.knowledge = d.knowledgeSwitchedOn(); }
    const id = d.savedModeId();
    if (!id) return done;
    d.clearSavedModeId();
    if (!d.packLicence() || d.activeModeId() || !d.modeExists(id)) return done;
    if ((await d.applyMode(id))?.success) done.modeId = id;
  } catch { /* restoration is best effort */ }
  return done;
}
