import { getBotChatId } from './userRegistry';
import type { GameState } from '../types/game';

type TelegramSendMessageOk = {
  ok: true;
  result: unknown;
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

  const chatId = getBotChatId(telegramId);
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
    text: 'Соперник присоединился. Открой игру, чтобы начать матч:',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть игру',
            callback_data: `open_game:${roomId}`,
          },
        ],
      ],
    },
  });
}

export async function notifyFriendIsInGame(targetTelegramId: number, roomId: string): Promise<void> {
  await sendMessageToTelegramId(targetTelegramId, {
    text: 'Твой друг уже в игре. Можешь открывать матч:',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть игру',
            callback_data: `open_game:${roomId}`,
          },
        ],
      ],
    },
  });
}

export async function sendRoundResultToPlayers(game: GameState, roomId: string, endReason: 'win' | 'leave' | 'disconnect'): Promise<void> {
  const attacker = game.players.attacker;
  const defender = game.players.defender;
  if (!attacker || !defender) return;

  const scoreLine = `Счёт: ${attacker.nickname} ${attacker.score} : ${defender.score} ${defender.nickname}`;
  const text =
    endReason === 'win'
      ? `Раунд завершён. Победитель: ${game.winner === 'X' ? attacker.nickname : defender.nickname}\n${scoreLine}`
      : endReason === 'leave'
        ? `Раунд завершён: один из игроков вышел.\n${scoreLine}`
        : `Раунд завершён: один из игроков отключился.\n${scoreLine}`;

  const tasks: Promise<boolean>[] = [];
  if (attacker.telegramId) tasks.push(sendMessageToTelegramId(attacker.telegramId, { text }));
  if (defender.telegramId) tasks.push(sendMessageToTelegramId(defender.telegramId, { text }));
  await Promise.all(tasks);
}
