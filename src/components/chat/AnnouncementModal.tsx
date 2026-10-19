import { AnnouncementCenter, type AnnouncementCenterProps } from '@/components/groupAnnouncement/AnnouncementCenter';

export type AnnouncementModalProps = AnnouncementCenterProps;

/** 群公告：查看、确认，群主和管理员还能发布、修改、删除、看确认情况。实现在 components/groupAnnouncement。 */
export function AnnouncementModal(props: AnnouncementModalProps): JSX.Element {
  return <AnnouncementCenter {...props} />;
}
