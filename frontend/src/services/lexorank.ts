const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
export const DEFAULT_INITIAL_RANK = "0|100000:";

export class RankSpaceExhausted extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RankSpaceExhausted";
  }
}

export function between(prevRank?: string | null, nextRank?: string | null): string {
  // 1. Both empty
  if (!prevRank && !nextRank) {
    return DEFAULT_INITIAL_RANK;
  }

  // 2. Before nextRank (head of list)
  if (!prevRank && nextRank) {
    if (nextRank.includes("|")) {
      const [bucket, r] = nextRank.split("|");
      const rClean = r.replace(":", "");
      if (/^\d+$/.test(rClean)) {
        const val = parseInt(rClean, 10);
        if (val > 1) {
          const nextVal = Math.floor(val / 2);
          return `${bucket}|${nextVal.toString().padStart(6, "0")}:`;
        } else {
          throw new RankSpaceExhausted(`Rank space exhausted before '${nextRank}'`);
        }
      }
    }
    const idx = ALPHABET.indexOf(nextRank[0]);
    if (idx > 1) {
      return ALPHABET[Math.floor(idx / 2)];
    } else if (idx === 1) {
      return "an";
    } else {
      if (nextRank.length > 1) {
        return "a" + between(null, nextRank.slice(1));
      }
      return "an";
    }
  }

  // 3. After prevRank (tail of list)
  if (prevRank && !nextRank) {
    if (prevRank.includes("|")) {
      const [bucket, r] = prevRank.split("|");
      const rClean = r.replace(":", "");
      if (/^\d+$/.test(rClean)) {
        const val = parseInt(rClean, 10);
        if (val <= 800000) {
          return `${bucket}|${(val + 100000).toString().padStart(6, "0")}:`;
        } else if (val < 999900) {
          const step = Math.max(1, Math.floor((999999 - val) / 2));
          return `${bucket}|${(val + step).toString().padStart(6, "0")}:`;
        } else {
          throw new RankSpaceExhausted(`Rank space exhausted after '${prevRank}'`);
        }
      }
    }
    const idx = ALPHABET.indexOf(prevRank[0]);
    if (idx < ALPHABET.length - 2) {
      return ALPHABET[Math.floor((idx + ALPHABET.length) / 2)];
    }
    return prevRank + "n";
  }

  const p = prevRank!;
  const q = nextRank!;

  if (p >= q) {
    throw new Error(`prevRank ('${p}') must be strictly less than nextRank ('${q}')`);
  }

  // 4. Handle bucketed ranks
  if (p.includes("|") && q.includes("|")) {
    const [b1, r1] = p.split("|");
    const [b2, r2] = q.split("|");
    if (b1 === b2) {
      const r1Clean = r1.replace(":", "");
      const r2Clean = r2.replace(":", "");
      if (/^\d+$/.test(r1Clean) && /^\d+$/.test(r2Clean)) {
        const n1 = parseInt(r1Clean, 10);
        const n2 = parseInt(r2Clean, 10);
        if (n2 - n1 > 1) {
          const mid = Math.floor((n1 + n2) / 2);
          return `${b1}|${mid.toString().padStart(6, "0")}:`;
        }
        throw new RankSpaceExhausted(`Rank space exhausted between '${p}' and '${q}'`);
      }
    }
  }

  // 5. Pure string midpoint
  let i = 0;
  while (i < p.length && i < q.length && p[i] === q[i]) {
    i++;
  }

  const prefix = p.slice(0, i);

  if (i < p.length && i < q.length) {
    const pIdx = ALPHABET.indexOf(p[i]);
    const qIdx = ALPHABET.indexOf(q[i]);

    if (qIdx - pIdx > 1) {
      const mid = Math.floor((pIdx + qIdx) / 2);
      return prefix + ALPHABET[mid];
    } else {
      let j = i + 1;
      while (j < p.length && p[j] === "z") {
        j++;
      }
      if (j < p.length) {
        const subIdx = ALPHABET.indexOf(p[j]);
        const mid = Math.floor((subIdx + ALPHABET.length) / 2);
        return p.slice(0, j) + ALPHABET[mid];
      } else {
        return p + "n";
      }
    }
  } else if (i === p.length && i < q.length) {
    let j = i;
    while (j < q.length && q[j] === "a") {
      j++;
    }
    if (j < q.length) {
      const nIdx = ALPHABET.indexOf(q[j]);
      if (nIdx > 1) {
        const mid = Math.floor(nIdx / 2);
        return q.slice(0, j) + ALPHABET[mid];
      } else {
        return q.slice(0, j) + "an";
      }
    } else {
      return p + "n";
    }
  }

  return p + "n";
}
