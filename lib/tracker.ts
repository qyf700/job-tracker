import type {OfficialJobStatus} from './catalog/job-status';

export const statusLabels = {
  saved: "待投递", applied: "已投递", in_progress: "流程中", offer: "Offer",
  rejected: "未通过", withdrawn: "已撤回", closed: "已结束",
} as const;
export type Status = keyof typeof statusLabels;
export type Application = {
  officialJob?: OfficialJobStatus | null;
  id: string; company: string; title: string; city: string; batch: string;
  sourceUrl: string; jd: string; status: Status; nextAction: string; dueDate: string | null;
  notes: string; version: number; createdAt: string; updatedAt: string; appliedAt: string | null;
};
export type ApplicationForm = Pick<Application, 'company' | 'title' | 'city' | 'batch' | 'sourceUrl' | 'jd' | 'status' | 'nextAction' | 'notes'> & { dueDate: string };
export const emptyForm: ApplicationForm = {
  company: '', title: '', city: '', batch: '', sourceUrl: '', jd: '', status: 'saved', nextAction: '', dueDate: '', notes: '',
};
export function toForm(item: Application): ApplicationForm {
  return {company:item.company,title:item.title,city:item.city,batch:item.batch,sourceUrl:item.sourceUrl,jd:item.jd,status:item.status,nextAction:item.nextAction,dueDate:item.dueDate ?? '',notes:item.notes};
}
export function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function isActive(item: Application) { return ['saved','applied','in_progress'].includes(item.status); }
export function isDue(item: Application, today: string) { return isActive(item) && !!item.nextAction && !!item.dueDate && item.dueDate <= today; }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {...init, cache:'no-store'});
  if (!response.ok) {
    let message = response.status === 401 ? '登录已失效，请刷新页面重新登录。' : `请求失败（${response.status}），请稍后重试。`;
    try { const body = await response.json() as {error?:string}; if (body.error) message = body.error; } catch { /* Non-JSON gateway errors use the status fallback. */ }
    throw new Error(message);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
