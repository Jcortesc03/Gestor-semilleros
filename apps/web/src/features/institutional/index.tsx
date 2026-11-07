import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { AnnouncementsSection } from './AnnouncementsSection';
import { PreferencesSection } from './PreferencesSection';
import { UsersSection } from './UsersSection';
import { WhatsappSection } from './WhatsappSection';

export type InstitutionalSection = 'users' | 'announcements' | 'preferences' | 'whatsapp';

export interface InstitutionalWorkspaceProps {
  user: CurrentUser;
  request: ApiRequest;
  section: InstitutionalSection;
}

export function InstitutionalWorkspace({ user, request, section }: InstitutionalWorkspaceProps) {
  switch (section) {
    case 'users':
      return <UsersSection user={user} request={request} />;
    case 'announcements':
      return <AnnouncementsSection user={user} request={request} />;
    case 'preferences':
      return <PreferencesSection request={request} />;
    case 'whatsapp':
      return <WhatsappSection user={user} request={request} />;
  }
}
