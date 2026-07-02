export type Nation = { id: number; name: string };
export type NationWithFlag = Nation & { flagUrl: string | null };

export async function fetchNationFlag(id: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/ptr/nations/${id}/law-states`);
    if (!res.ok) return null;
    const data = await res.json();
    const categories: any[] = Array.isArray(data) ? data : data.categories ?? [];
    for (const cat of categories) {
      const laws: any[] = cat.laws ?? [];
      for (const law of laws) {
        const name = String(law.law_name ?? "").toLowerCase();
        if (!name.includes("national flag")) continue;
        const value = String(law.current_value ?? "").trim();
        if (value.startsWith("http")) return value;
      }
    }
  } catch {}
  return null;
}

export async function fetchNationsWithFlags(): Promise<NationWithFlag[]> {
  const res = await fetch("/api/ptr/nations");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const list: Nation[] = await res.json();
  const enriched = await Promise.all(
    list.map(async (nation) => ({
      ...nation,
      flagUrl: await fetchNationFlag(nation.id),
    })),
  );

  return enriched.sort((a, b) => a.name.localeCompare(b.name));
}