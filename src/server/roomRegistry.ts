type RoomInfo = {
  initiatorTelegramId: number;
  initiatorNickname: string;
  createdAt: number;
};

const registry = new Map<string, RoomInfo>();

const pendingRoomByTelegramId = new Map<number, { roomId: string; createdAt: number }>();

const TTL_MS = 6 * 60 * 60 * 1000;

const cleanup = (): void => {
  const now = Date.now();
  for (const [roomId, info] of registry.entries()) {
    if (now - info.createdAt > TTL_MS) {
      registry.delete(roomId);
    }
  }

  for (const [telegramId, info] of pendingRoomByTelegramId.entries()) {
    if (now - info.createdAt > TTL_MS) {
      pendingRoomByTelegramId.delete(telegramId);
    }
  }
};

export function registerRoomInitiator(roomId: string, initiatorTelegramId: number, initiatorNickname: string): void {
  cleanup();
  registry.set(roomId, { initiatorTelegramId, initiatorNickname, createdAt: Date.now() });
}

export function getRoomInitiator(roomId: string): { telegramId: number; nickname: string } | undefined {
  cleanup();
  const info = registry.get(roomId);
  if (!info) return undefined;
  return { telegramId: info.initiatorTelegramId, nickname: info.initiatorNickname };
}

export function setPendingRoomForUser(telegramId: number, roomId: string): void {
  cleanup();
  pendingRoomByTelegramId.set(telegramId, { roomId, createdAt: Date.now() });
}

export function consumePendingRoomForUser(telegramId: number): string | undefined {
  cleanup();
  const info = pendingRoomByTelegramId.get(telegramId);
  if (!info) return undefined;
  pendingRoomByTelegramId.delete(telegramId);
  return info.roomId;
}
