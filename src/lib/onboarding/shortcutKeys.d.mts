export function acceleratorToKeys(accelerator: string, platform: string): string[];

export function matchesAccelerator(
  e: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean },
  accelerator: string,
  platform: string,
): boolean;

export function shortcutKeysFor(
  keybinds: Array<{ id: string; accelerator?: string }> | null | undefined,
  id: string,
  platform: string,
): string[];
