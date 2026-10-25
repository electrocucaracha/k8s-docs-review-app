export type LineDiff = {
  added: number[];
  removed: number[];
  replaced: number[];
};

type Change = "same" | "added" | "removed";

export function diffLines(before: string, after: string): LineDiff {
  const left = before.split("\n");
  const right = after.split("\n");
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - suffix - 1] === right[right.length - suffix - 1]
  ) suffix++;

  const oldLines = left.slice(prefix, left.length - suffix);
  const newLines = right.slice(prefix, right.length - suffix);
  const columns = newLines.length + 1;
  const rows = oldLines.length + 1;
  const changes: Change[] = Array(prefix).fill("same");

  // ponytail: LCS caps at 4M cells; use Myers for very large divergent files.
  if (oldLines.length * newLines.length > 4_000_000) {
    changes.push(...Array(oldLines.length).fill("removed"), ...Array(newLines.length).fill("added"));
  } else {
    const lcs = new Uint32Array(rows * columns);
    for (let i = oldLines.length - 1; i >= 0; i--) {
      for (let j = newLines.length - 1; j >= 0; j--) {
        lcs[i * columns + j] = oldLines[i] === newLines[j]
          ? lcs[(i + 1) * columns + j + 1] + 1
          : Math.max(lcs[(i + 1) * columns + j], lcs[i * columns + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        changes.push("same");
        i++;
        j++;
      } else if (i < oldLines.length && (j === newLines.length ||
        lcs[(i + 1) * columns + j] >= lcs[i * columns + j + 1])) {
        changes.push("removed");
        i++;
      } else {
        changes.push("added");
        j++;
      }
    }
  }
  changes.push(...Array(suffix).fill("same"));

  const diff: LineDiff = { added: [], removed: [], replaced: [] };
  let oldLine = 1;
  let newLine = 1;
  for (let index = 0; index < changes.length;) {
    if (changes[index] === "same") {
      oldLine++;
      newLine++;
      index++;
      continue;
    }
    const removed: number[] = [];
    const added: number[] = [];
    while (index < changes.length && changes[index] !== "same") {
      if (changes[index] === "removed") removed.push(oldLine++);
      else added.push(newLine++);
      index++;
    }
    const paired = Math.min(removed.length, added.length);
    diff.replaced.push(...removed.slice(0, paired), ...added.slice(0, paired));
    diff.removed.push(...removed.slice(paired));
    diff.added.push(...added.slice(paired));
  }
  return diff;
}
