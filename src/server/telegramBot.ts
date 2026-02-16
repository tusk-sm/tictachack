import { getBotChatIdAsync } from './userRegistry';
import type { GameState } from '../types/game';
import { setPendingRoomForUser } from './roomRegistry';

type TelegramSendMessageOk = {
  ok: true;
  result: unknown;
};

const sendGameToTelegramId = async (telegramId: number, roomId: string): Promise<boolean> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN is missing, cannot send game');
    return false;
  }

  const chatId = await getBotChatIdAsync(telegramId);
  if (!chatId) {
    console.info('User has no bot chat id (needs /start to enable notifications)', { telegramId });
    return false;
  }

  setPendingRoomForUser(telegramId, roomId);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendGame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        game_short_name: 'tictachack',
      }),
    });

    const json = (await response.json()) as TelegramSendMessageResponse;
    if (!response.ok || !json.ok) {
      console.warn('Failed to send Telegram game', {
        telegramId,
        chatId,
        httpOk: response.ok,
        error_code: (json as TelegramSendMessageFail).error_code,
        description: (json as TelegramSendMessageFail).description,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('Telegram sendGame error:', error);
    return false;
  }
};

type TelegramSendMessageFail = {
  ok: false;
  error_code?: number;
  description?: string;
};

type TelegramSendMessageResponse = TelegramSendMessageOk | TelegramSendMessageFail;

const sendMessageToTelegramId = async (telegramId: number, payload: { text: string; reply_markup?: unknown }): Promise<boolean> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN is missing, cannot send messages');
    return false;
  }

  const chatId = await getBotChatIdAsync(telegramId);
  if (!chatId) {
    console.info('User has no bot chat id (needs /start to enable notifications)', { telegramId });
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        ...payload,
      }),
    });

    const json = (await response.json()) as TelegramSendMessageResponse;
    if (!response.ok || !json.ok) {
      console.warn('Failed to send Telegram message', {
        telegramId,
        chatId,
        httpOk: response.ok,
        error_code: (json as TelegramSendMessageFail).error_code,
        description: (json as TelegramSendMessageFail).description,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('Telegram sendMessage error:', error);
    return false;
  }
};

export async function notifyOpponentJoined(roomChatId: string | undefined, nickname: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !roomChatId) {
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: roomChatId,
        text: `Соперник (${nickname}) присоединился к игре. Можно начинать!`,
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      console.error('Failed to send Telegram notification:', payload);
    }
  } catch (error) {
    console.error('Telegram notification error:', error);
  }
}

export async function sendOpenGameButtonToUser(telegramId: number, roomId: string): Promise<void> {
  await sendMessageToTelegramId(telegramId, {
    text: 'Соперник присоединился. Нажми на игру ниже, чтобы открыть матч:',
  });
  await sendGameToTelegramId(telegramId, roomId);
}

export async function notifyFriendIsInGame(targetTelegramId: number, roomId: string): Promise<void> {
  await sendMessageToTelegramId(targetTelegramId, {
    text: 'Твой друг уже в игре. Нажми на игру ниже, чтобы открыть матч:',
  });
  await sendGameToTelegramId(targetTelegramId, roomId);
}

export async function sendRoundResultToPlayers(game: GameState, roomId: string, endReason: 'win' | 'leave' | 'disconnect'): Promise<void> {
  const attacker = game.players.attacker;
  const defender = game.players.defender;
  if (!attacker || !defender) return;

  console.info('sendRoundResultToPlayers', {
    roomId,
    endReason,
    attackerTelegramId: attacker.telegramId,
    defenderTelegramId: defender.telegramId,
    attackerName: attacker.nickname,
    defenderName: defender.nickname,
  });

  const scoreLine = `Счёт: ${attacker.nickname} ${attacker.score} : ${defender.score} ${defender.nickname}`;
  const text =
    endReason === 'win'
      ? `Раунд завершён. Победитель: ${game.winner === 'X' ? attacker.nickname : defender.nickname}\n${scoreLine}`
      : endReason === 'leave'
        ? `Раунд завершён: один из игроков вышел.\n${scoreLine}`
        : `Раунд завершён: один из игроков отключился.\n${scoreLine}`;

  const tasks: Promise<boolean>[] = [];
  if (attacker.telegramId) {
    tasks.push(sendMessageToTelegramId(attacker.telegramId, { text }));
  } else {
    console.warn('Cannot send round result: attacker.telegramId is missing', { roomId });
  }

  if (defender.telegramId) {
    tasks.push(sendMessageToTelegramId(defender.telegramId, { text }));
  } else {
    console.warn('Cannot send round result: defender.telegramId is missing', { roomId });
  }
  await Promise.all(tasks);
}
