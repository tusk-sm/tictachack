type UserChatInfo = {
  botChatId?: string;
};

const registry = new Map<number, UserChatInfo>();

export function registerBotChat(telegramId: number, botChatId: string): void {
  const existing = registry.get(telegramId) || {};
  registry.set(telegramId, { ...existing, botChatId });
}

export function getBotChatId(telegramId: number): string | undefined {
  return registry.get(telegramId)?.botChatId;
}
