export const pad = (n) => String(n).padStart(2, '0');
export const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export function relTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const days = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if (days === 0) return hm;
  if (days === 1) return '昨天 ' + hm;
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}
export function fullTime(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
export function sectionOf(iso) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if (days <= 0) return { key: 'today', label: '今天' };
  if (days === 1) return { key: 'yesterday', label: '昨天' };
  if (days < 7) return { key: 'week', label: '近 7 天' };
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return { key: 'month', label: '本月早些时候' };
  const key = d.getFullYear() + '-' + (d.getMonth() + 1);
  return { key, label: (d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + ' 年 ') + (d.getMonth() + 1) + ' 月' };
}
