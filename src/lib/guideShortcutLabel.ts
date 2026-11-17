export function guideShortcutLabel(platform: 'darwin' | 'win32', key: string): string {
  return `${platform === 'darwin' ? '⌘⌥⇧⌃' : 'Ctrl/Alt/Shift/Win'} + ${key}`;
}
