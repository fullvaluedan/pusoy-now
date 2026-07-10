// Extract the first letter of a name for avatar display.
// Used by components/Avatar.tsx and tested in lib/initialsTest.ts.
export function avatarInitial(name: string | undefined): string {
  if (!name) return '?';
  const trimmed = name.trim();
  return trimmed.charAt(0).toUpperCase() || '?';
}
