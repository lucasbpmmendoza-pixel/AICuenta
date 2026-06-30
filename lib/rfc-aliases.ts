const RFC_ALIASES: Record<string, string> = {};

export function rfcAlias(rfc: string): string | null {
  return RFC_ALIASES[rfc.toUpperCase()] ?? null;
}

export function rfcDisplay(rfc: string): string {
  return RFC_ALIASES[rfc.toUpperCase()] ?? rfc;
}
