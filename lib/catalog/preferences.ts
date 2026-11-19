import {and, asc, eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '../../db';
import {catalogFilters, catalogPreferences} from '../../db/schema';
import {filterSchema} from './filters';
import {CatalogError, mokaSources} from './moka';

const sourceSettings = z.object({
  sourceIds: z.array(z.string()).max(mokaSources.length).refine(ids =>
    new Set(ids).size === ids.length && ids.every(id => mokaSources.some(source => source.id === id))
  ),
  intervalHours: z.number().int().min(0).max(168),
}).strict();

const filterId = z.string().uuid();
const name = z.string().trim().min(1).max(40);
const revision = z.number().int().positive();
const updateSchema = z.discriminatedUnion('action', [
  z.object({action: z.literal('sources'), settings: sourceSettings}).strict(),
  z.object({action: z.literal('create'), name, filters: filterSchema}).strict(),
  z.object({action: z.literal('edit'), filterId, name, filters: filterSchema, revision}).strict(),
  z.object({action: z.literal('select'), filterId: filterId.nullable()}).strict(),
  z.object({action: z.literal('delete'), filterId, revision}).strict(),
  z.object({action: z.literal('viewed'), filterId, revision, through: z.string().datetime()}).strict(),
]);

export async function readCatalogSettings(ownerId: string) {
  const [row] = await getDb().select().from(catalogPreferences).where(eq(catalogPreferences.ownerId, ownerId));
  const ids = row ? z.array(z.string()).parse(JSON.parse(row.sourceIdsJson)) : [];
  return {
    sourceIds: ids.filter(id => mokaSources.some(source => source.id === id)),
    intervalHours: row?.intervalHours ?? 6,
    activeFilterId: row?.activeFilterId ?? null,
  };
}

export async function readCatalogPreferences(ownerId: string) {
  const [settings, filters] = await Promise.all([
    readCatalogSettings(ownerId),
    getDb().select().from(catalogFilters).where(eq(catalogFilters.ownerId, ownerId))
      .orderBy(asc(catalogFilters.name), asc(catalogFilters.id)),
  ]);
  return {
    ...settings,
    savedFilters: filters.map(({id, name, revision, viewedThrough, filterJson}) => ({
      id, name, revision, viewedThrough, filters: filterSchema.parse(JSON.parse(filterJson)),
    })),
  };
}

export async function writeCatalogPreferences(ownerId: string, body: unknown, canSchedule: boolean) {
  const result = updateSchema.safeParse(body);
  if (!result.success) throw new CatalogError('invalid_preferences', '岗位设置无效', 422);
  const update = result.data;
  const db = getDb();
  const owner = eq(catalogPreferences.ownerId, ownerId);
  const filterOwner = eq(catalogFilters.ownerId, ownerId);
  const conflict = () => new CatalogError('filter_changed', '已保存筛选发生变化，请刷新目录', 409);
  const useFilter = (activeFilterId: string | null) => db.insert(catalogPreferences)
    .values({ownerId, activeFilterId}).onConflictDoUpdate({target: catalogPreferences.ownerId, set: {activeFilterId}});

  switch (update.action) {
    case 'sources': {
      if (!canSchedule) throw new CatalogError('forbidden', '此实例未启用本地自动同步', 403);
      const fields = {sourceIdsJson: JSON.stringify(update.settings.sourceIds), intervalHours: update.settings.intervalHours};
      await db.insert(catalogPreferences).values({ownerId, ...fields}).onConflictDoUpdate({
        target: catalogPreferences.ownerId, set: fields,
      });
      break;
    }
    case 'create': {
      const id = crypto.randomUUID();
      const [created] = await db.batch([
        db.insert(catalogFilters).select(db.select({
          id: sql`${id}`.as('id'), ownerId: sql`${ownerId}`.as('ownerId'),
          name: sql`${update.name}`.as('name'), filterJson: sql`${JSON.stringify(update.filters)}`.as('filterJson'),
          viewedThrough: sql`${new Date().toISOString()}`.as('viewedThrough'), revision: sql`1`.as('revision'),
        }).from(sql`(select 1)`).where(sql`(select count(*) from catalog_filters where owner_id = ${ownerId}) < 20`)).returning(),
        db.insert(catalogPreferences).select(
          db.select({
            ownerId: sql`${ownerId}`.as('ownerId'), sourceIdsJson: sql`'[]'`.as('sourceIdsJson'),
            intervalHours: sql`6`.as('intervalHours'), activeFilterId: sql`${id}`.as('activeFilterId'),
          })
            .from(catalogFilters).where(eq(catalogFilters.id, id))
        ).onConflictDoUpdate({target: catalogPreferences.ownerId, set: {activeFilterId: id}}),
      ]);
      if (!created.length) throw new CatalogError('filter_limit', '最多保存 20 组筛选', 422);
      break;
    }
    case 'select': {
      if (update.filterId) {
        const rows = await db.update(catalogPreferences).set({activeFilterId: update.filterId}).where(and(
          owner, sql`exists (select 1 from catalog_filters where owner_id = ${ownerId} and id = ${update.filterId})`
        )).returning();
        if (!rows.length) throw conflict();
      } else {
        await useFilter(null);
      }
      break;
    }
    case 'edit':
    case 'viewed':
    case 'delete': {
      const match = and(filterOwner, eq(catalogFilters.id, update.filterId), eq(catalogFilters.revision, update.revision));
      if (update.action === 'delete') {
        const [removed] = await db.batch([
          db.delete(catalogFilters).where(match).returning(),
          db.update(catalogPreferences).set({activeFilterId: null}).where(and(owner,
            eq(catalogPreferences.activeFilterId, update.filterId),
            sql`not exists (select 1 from catalog_filters where id = ${update.filterId})`)),
        ]);
        if (!removed.length) throw conflict();
      } else if (update.action === 'edit') {
        const filterJson = JSON.stringify(update.filters);
        const rows = await db.update(catalogFilters).set({
          name: update.name, filterJson,
          revision: sql`${catalogFilters.revision} + 1`,
          viewedThrough: sql`case when ${catalogFilters.filterJson} = ${filterJson}
            then ${catalogFilters.viewedThrough} else ${new Date().toISOString()} end`,
        }).where(match).returning();
        if (!rows.length) throw conflict();
      } else {
        if (Date.parse(update.through) > Date.now()) throw new CatalogError('invalid_view_time', '查看时间无效', 422);
        const rows = await db.update(catalogFilters).set({
          viewedThrough: sql`max(${catalogFilters.viewedThrough}, ${update.through})`,
        }).where(match).returning();
        if (!rows.length) throw conflict();
      }
      break;
    }
  }
  return readCatalogPreferences(ownerId);
}
