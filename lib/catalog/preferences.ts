import {and, eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db';
import {catalogPreferences} from '../../db/schema';
import {filterSchema} from './filters';
import {CatalogError, mokaSources} from './moka';

const sourceSettings = z.object({
  sourceIds: z.array(z.string()).max(mokaSources.length).refine(ids =>
    new Set(ids).size === ids.length && ids.every(id => mokaSources.some(source => source.id === id))
  ),
  intervalHours: z.number().int().min(0).max(168),
}).strict();

const updateSchema = z.discriminatedUnion('action', [
  z.object({action: z.literal('sources'), settings: sourceSettings}).strict(),
  z.object({action: z.literal('filter'), filters: filterSchema}).strict(),
  z.object({action: z.literal('viewed'), filterId: z.string().uuid(), through: z.string().datetime()}).strict(),
]);

export async function readCatalogPreferences(ownerId: string) {
  const [row] = await getDb().select().from(catalogPreferences).where(eq(catalogPreferences.ownerId, ownerId));
  return {
    sourceIds: row ? sourceSettings.shape.sourceIds.parse(JSON.parse(row.sourceIdsJson)) : [],
    intervalHours: row?.intervalHours ?? 6,
    savedFilter: row?.filterJson && row.filterId && row.viewedThrough ? {
      id: row.filterId,
      filters: filterSchema.parse(JSON.parse(row.filterJson)),
      viewedThrough: row.viewedThrough,
    } : null,
  };
}

export async function writeCatalogPreferences(ownerId: string, body: unknown, canSchedule: boolean) {
  const result = updateSchema.safeParse(body);
  if (!result.success) throw new CatalogError('invalid_preferences', '岗位设置无效', 422);
  const update = result.data;
  const db = getDb();
  if (update.action === 'viewed') {
    if (Date.parse(update.through) > Date.now()) throw new CatalogError('invalid_view_time', '查看时间无效', 422);
    const rows = await db.update(catalogPreferences).set({
      viewedThrough: sql`max(${catalogPreferences.viewedThrough}, ${update.through})`,
    }).where(and(eq(catalogPreferences.ownerId, ownerId), eq(catalogPreferences.filterId, update.filterId))).returning();
    if (!rows.length) throw new CatalogError('filter_changed', '已保存筛选发生变化，请刷新目录', 409);
  } else {
    if (update.action === 'sources' && !canSchedule) {
      throw new CatalogError('forbidden', '此实例未启用本地自动同步', 403);
    }
    const fields = update.action === 'sources'
      ? {sourceIdsJson: JSON.stringify(update.settings.sourceIds), intervalHours: update.settings.intervalHours}
      : {filterJson: JSON.stringify(update.filters), filterId: crypto.randomUUID(), viewedThrough: new Date().toISOString()};
    await db.insert(catalogPreferences).values({ownerId, ...fields}).onConflictDoUpdate({
      target: catalogPreferences.ownerId,
      set: fields,
    });
  }
  return readCatalogPreferences(ownerId);
}
