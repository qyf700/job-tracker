import {z} from 'zod';

export const filterSchema = z.object({
  q: z.string().trim().max(100).default(''),
  companyId: z.string().max(100).default(''),
  city: z.string().trim().max(100).default(''),
  programKind: z.enum(['', 'unknown', 'autumn', 'summer_internship', 'daily_internship', 'other']).default(''),
  employmentType: z.enum(['', 'intern', 'full_time', 'unknown']).default(''),
  graduationYear: z.string().regex(/^(|20\d{2})$/).default(''),
  availability: z.enum(['', 'accepting', 'visible_unverified', 'closed', 'stale', 'reopened']).default(''),
}).strict();

export type CatalogFilters = z.infer<typeof filterSchema>;

export function sameFilters(a: CatalogFilters, b: CatalogFilters) {
  return (Object.keys(a) as (keyof CatalogFilters)[]).every(key => a[key] === b[key]);
}
