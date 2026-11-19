"use client";

import {useEffect, useState} from 'react';
import {Bell} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from '@/components/ui/sheet';
import {api} from '@/lib/tracker';
import type {NotificationItem, NotificationKind} from '@/lib/notifications';

const labels = {job: '新岗位', deadline: '即将截止', follow_up: '待跟进', interview: '即将开始'};
const settings: {kind: NotificationKind; label: string}[] = [
  {kind: 'job', label: '匹配的新岗位'},
  {kind: 'deadline', label: '待投递截止'},
  {kind: 'follow_up', label: '到期跟进'},
  {kind: 'interview', label: '面试与笔试'},
];
const clock = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function Notifications({onOpenApplication, onOpenJob}: {
  onOpenJob: (id: string) => boolean;
  onOpenApplication: (id: string, interviews: boolean) => Promise<boolean>;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState('');
  const [mutedKinds, setMutedKinds] = useState<NotificationKind[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const unread = items.filter(item => !item.read).length;

  useEffect(() => {
    let request: AbortController | undefined;
    async function refresh() {
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const data = await api<{items: NotificationItem[]; mutedKinds: NotificationKind[]}>('/api/notifications', {signal: current.signal});
        if (current.signal.aborted) return;
        setItems(data.items);
        setMutedKinds(data.mutedKinds);
        setLoaded(true);
        setError('');
      } catch (e) {
        if (!current.signal.aborted) setError(e instanceof Error ? e.message : '通知加载失败');
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [open, refreshKey]);

  async function toggleKind(kind: NotificationKind) {
    const next = mutedKinds.includes(kind) ? mutedKinds.filter(item => item !== kind) : [...mutedKinds, kind];
    setSavingSettings(true);
    setError('');
    try {
      await api('/api/notifications', {method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({mutedKinds: next})});
      setMutedKinds(next);
      setItems(previous => previous.filter(item => !next.includes(item.kind)));
      setRefreshKey(value => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存通知设置失败');
    } finally {
      setSavingSettings(false);
    }
  }

  async function markRead(item: NotificationItem) {
    if (item.read) return;
    setReading(item.id);
    setError('');
    try {
      await api('/api/notifications', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: item.id})});
      setItems(previous => previous.map(row => row.id === item.id ? {...row, read: true} : row));
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新已读状态失败');
    } finally {
      setReading('');
    }
  }

  async function openItem(item: NotificationItem) {
    try {
      const opened = item.jobId ? onOpenJob(item.jobId)
        : item.applicationId && await onOpenApplication(item.applicationId, item.kind === 'interview');
      if (opened) {
        setOpen(false);
        void markRead(item);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '暂时无法打开这条通知');
    }
  }

  return <Sheet open={open} onOpenChange={setOpen}>
    <Button size="sm" variant="outline" className="workspace-notifications" onClick={() => setOpen(true)}>
      <Bell size={15}/>通知{unread > 0 && <span aria-label={`${unread} 条未读`}>{unread}</span>}
    </Button>
    <SheetContent className="detail-sheet">
      <SheetHeader>
        <SheetTitle>通知</SheetTitle>
        <SheetDescription>匹配的新岗位与即将到期的事项</SheetDescription>
      </SheetHeader>
      <div className="drawer-fields notification-list">
        {loaded && <fieldset className="catalog-filters" disabled={savingSettings}>
          <legend>显示哪些通知</legend>
          {settings.map(({kind,label}) => <label key={kind} className="catalog-toggle">
            <input type="checkbox" checked={!mutedKinds.includes(kind)} onChange={() => void toggleKind(kind)}/>
            {label}
          </label>)}
        </fieldset>}
        {error && <p role="alert">{error}</p>}
        {!error && !loaded && <p role="status">正在加载通知…</p>}
        {!error && loaded && !items.length && <p>暂无通知</p>}
        {items.map(item => <article key={item.id} className="notification-item">
          <div><span className="badge">{labels[item.kind]}</span> {!item.read && <span>未读</span>}</div>
          <strong>{item.company} · {item.title}</strong>
          <span>{item.kind === 'follow_up' ? item.at : clock.format(new Date(item.at))}
            {item.action && ` · ${item.action}`}
            {item.filters?.length ? ` · ${item.filters.join('、')}` : null}</span>
          <div className="catalog-job-actions">
            <Button size="sm" variant="outline" onClick={() => void openItem(item)}>
              {item.kind === 'job' ? '查看岗位' : item.kind === 'interview' ? '查看日程' : '查看投递'}
            </Button>
            {!item.read && <Button size="sm" variant="ghost" disabled={!!reading}
              onClick={() => void markRead(item)}>标为已读</Button>}
          </div>
        </article>)}
      </div>
    </SheetContent>
  </Sheet>;
}
