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
