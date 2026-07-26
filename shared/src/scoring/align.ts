// 通用序列對齊（Levenshtein backtrace），docs/01 §3.1 逐字比對的基礎。
// 回傳對齊後的配對：diagonal（target 對到 heard）、deletion（target 漏念 → 無 heard）、
// insertion（多念出來的 heard → 無 target）。insertion 不會產生 target 的分數，
// 但會佔用對齊位置，避免整串位移導致全灰。

export interface AlignedPair<T, H> {
  target?: T;
  heard?: H;
}

/**
 * @param subCost 對齊代價：0 表示這對「相同/相近」應該對在一起，>0 表示替換代價。
 *   為了讓相近的字優先對齊（而不是拆成一刪一插），tie 時偏好 diagonal。
 */
export function align<T, H>(
  targets: readonly T[],
  heards: readonly H[],
  subCost: (t: T, h: H) => number,
): AlignedPair<T, H>[] {
  const n = targets.length;
  const m = heards.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = dp[i - 1][j - 1] + subCost(targets[i - 1], heards[j - 1]);
      const del = dp[i - 1][j] + 1;
      const ins = dp[i][j - 1] + 1;
      dp[i][j] = Math.min(diag, del, ins);
    }
  }

  // backtrace
  const pairs: AlignedPair<T, H>[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const diag = dp[i - 1][j - 1] + subCost(targets[i - 1], heards[j - 1]);
      if (dp[i][j] === diag) {
        pairs.push({ target: targets[i - 1], heard: heards[j - 1] });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      pairs.push({ target: targets[i - 1] }); // 漏念
      i--;
      continue;
    }
    // insertion（多念）
    pairs.push({ heard: heards[j - 1] });
    j--;
  }
  pairs.reverse();
  return pairs;
}
