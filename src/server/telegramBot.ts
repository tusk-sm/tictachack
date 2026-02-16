import { getBotChatId } from './userRegistry';

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
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = getBotChatId(telegramId);
  if (!token || !chatId) {
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
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
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      console.error('Failed to send open-game button:', payload);
    }
  } catch (error) {
    console.error('Telegram open-game error:', error);
  }
}
