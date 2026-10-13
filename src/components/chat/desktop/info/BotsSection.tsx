import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversationBots, removeBotInstallation, updateBotInstallation } from '@/api/bots';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { BotInstallation, User } from '@/types/api';
import { Section } from './controls';
import { useInfo } from './infoContext';

function botUserOf(installation: BotInstallation): User {
  const bot = installation.bot;
  return bot?.user ?? { id: bot?.user_id ?? installation.bot_id, username: bot?.name ?? '机器人', nickname: bot?.name ?? '机器人', avatar_url: bot?.avatar_url, is_bot: true };
}

/** 本群已添加的机器人。管理员可以停用或移出。 */
export function BotsSection(): JSX.Element {
  const { conversation, canManage } = useInfo();
  const queryClient = useQueryClient();
  const conversationId = conversation.id;
  const queryKey = ['conversation-bots', conversationId];

  const botsQuery = useQuery({
    queryKey,
    queryFn: () => getConversationBots(conversationId),
    staleTime: 10_000
  });

  const removeMutation = useMutation({
    mutationFn: (botId: number) => removeBotInstallation(botId, conversationId),
    onSuccess: (_data, botId) => {
      queryClient.setQueryData<BotInstallation[] | undefined>(queryKey, (current) => current?.filter((installation) => installation.bot_id !== botId));
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members-page'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ botId, enabled }: { botId: number; enabled: boolean }) => updateBotInstallation(botId, conversationId, { enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey })
  });

  const bots = botsQuery.data ?? [];

  return (
    <Section title="群机器人" action={bots.length > 0 ? <span>{bots.length} 个</span> : undefined}>
      {botsQuery.isLoading ? <p className="kci-hint">正在加载机器人…</p> : null}
      {!botsQuery.isLoading && bots.length === 0 ? <p className="kci-hint">暂无机器人，可到机器人中心添加公开机器人。</p> : null}
      {bots.map((installation) => {
        const name = installation.bot?.name ?? `机器人 ${installation.bot_id}`;
        return (
          <div key={installation.id} className="kui-row">
            <Avatar user={botUserOf(installation)} label={name} size="sm" />
            <span className="kui-row-label kci-clip">
              {name}
              <span className="kui-row-hint kci-clip">{installation.enabled ? installation.bot?.description || 'KukeChat Bot API' : '已停用，不会接收或发送消息'}</span>
            </span>
            {canManage ? (
              <>
                <input type="checkbox" role="switch" className="kui-switch" aria-label={`启用 ${name}`} checked={installation.enabled} disabled={toggleMutation.isPending} onChange={(event) => toggleMutation.mutate({ botId: installation.bot_id, enabled: event.target.checked })} />
                <button type="button" className="kui-icon-btn" title="移出本群" aria-label={`将 ${name} 移出本群`} disabled={removeMutation.isPending} onClick={() => {
                  // 图标按钮容易误触，移出前确认一下
                  if (window.confirm(`确定将机器人「${name}」移出本群吗？`)) {
                    removeMutation.mutate(installation.bot_id);
                  }
                }}><Icon name="trash" className="h-4 w-4" /></button>
              </>
            ) : null}
          </div>
        );
      })}
    </Section>
  );
}
