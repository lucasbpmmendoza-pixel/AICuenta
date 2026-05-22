const RFC_ALIASES: Record<string, string> = {
  'BFR140708FJ9': 'Chikenelo_1',
  'LIF101018K80': 'Chikenelo_2',
  'LIF170822MZ3': 'Chikenelo_3',
};

export function rfcAlias(rfc: string): string | null {
  return RFC_ALIASES[rfc.toUpperCase()] ?? null;
}

export function rfcDisplay(rfc: string): string {
  return RFC_ALIASES[rfc.toUpperCase()] ?? rfc;
}
