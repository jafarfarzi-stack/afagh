export type EquivalenceMember = { clusterCode: number; code: string };

export function expandPassedWithEquivalents(
  passed: Map<string, number>,
  members: Iterable<EquivalenceMember>,
): Map<string, number> {
  const groups = new Map<number, string[]>();
  for (const member of members) {
    const list = groups.get(member.clusterCode);
    if (list) list.push(member.code);
    else groups.set(member.clusterCode, [member.code]);
  }

  let expanded: Map<string, number> | null = null;
  for (const codes of groups.values()) {
    if (codes.length < 2) continue;
    let best: number | null = null;
    for (const code of codes) {
      const grade = passed.get(code);
      if (grade != null && (best == null || grade > best)) best = grade;
    }
    if (best == null) continue;
    for (const code of codes) {
      const grade = passed.get(code);
      if (grade != null && grade >= best) continue;
      if (!expanded) expanded = new Map(passed);
      expanded.set(code, best);
    }
  }
  return expanded ?? passed;
}
