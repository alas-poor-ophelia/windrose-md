/**
 * entityList.ts
 * Generic immutable by-id list operations shared by the per-entity operations modules.
 * Null policy: a null/undefined/non-array list is treated as empty and yields [].
 */

interface HasId {
  id: string;
}

function updateById<T extends HasId>(
  list: T[] | null | undefined,
  id: string,
  updates: Partial<Omit<T, 'id'>>
): T[] {
  if (!list || !Array.isArray(list)) return [];
  return list.map(item => (item.id === id ? { ...item, ...updates } : item));
}

function removeById<T extends HasId>(list: T[] | null | undefined, id: string): T[] {
  if (!list || !Array.isArray(list)) return [];
  return list.filter(item => item.id !== id);
}

/** Replace the item with a matching id, or append when none matches. */
function upsertById<T extends HasId>(list: T[] | null | undefined, item: T): T[] {
  if (!list || !Array.isArray(list)) return [item];
  return list.some(existing => existing.id === item.id)
    ? list.map(existing => (existing.id === item.id ? item : existing))
    : [...list, item];
}

export { updateById, removeById, upsertById };
export type { HasId };
