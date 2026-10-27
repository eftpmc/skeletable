type Identity = {
  gtin: string | null;
  mpn: string | null;
  model: string | null;
  matchKey: string;
  brand: string | null;
};

/** Exact barcodes win; weaker identifiers must agree and identify only one candidate. */
export function matchingProduct<T extends Identity>(incoming: Identity, candidates: T[]): T | undefined {
  const compatible = candidates.filter((candidate) =>
    (!candidate.brand || !incoming.brand || candidate.brand.toLowerCase() === incoming.brand.toLowerCase()) &&
    !(incoming.gtin && candidate.gtin && incoming.gtin !== candidate.gtin) &&
    !(incoming.mpn && candidate.mpn && incoming.mpn.toLowerCase() !== candidate.mpn.toLowerCase()),
  );
  const unambiguous = (matches: T[]) => matches.length === 1 ? matches[0] : undefined;
  return candidates.find((candidate) => incoming.gtin && candidate.gtin === incoming.gtin) ??
    unambiguous(compatible.filter((candidate) => incoming.mpn && candidate.mpn?.toLowerCase() === incoming.mpn.toLowerCase())) ??
    unambiguous(compatible.filter((candidate) => incoming.model && candidate.model === incoming.model)) ??
    unambiguous(compatible.filter((candidate) => candidate.matchKey === incoming.matchKey));
}
