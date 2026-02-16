import { Server } from 'socket.io';
import { Server as NetServer } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';
import { CellValue, GameState, Player } from '../../types/game';
import { APP_URL } from '../../../constants';
import { validateTelegramInitData } from '../../server/telegram';
import { saveGameHistory } from '../../server/gameHistory';
import { notifyOpponentJoined, sendOpenGameButtonToUser } from '../../server/telegramBot';
import { getTelegramAvatarUrl } from '../../server/telegramProfile';
import { getRoomInitiator } from '../../server/roomRegistry';
import crypto from 'crypto';

export type NextApiResponseWithSocket = NextApiResponse & {
    socket: {
        server: NetServer & {
            io: Server;
        };
    };
};

type GameAuthTokenPayload = {
    v: 1;
    exp: number;
    telegramId: number;
    nickname: string;
    username?: string;
    roomId: string;
    chatId?: string;
};

const base64UrlDecode = (value: string): string => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + pad, 'base64').toString('utf8');
};

const verifyAuthToken = (token: string, secret: string): { ok: true; payload: GameAuthTokenPayload } | { ok: false; reason: string } => {
    const parts = token.split('.');
    if (parts.length !== 2) return { ok: false, reason: 'bad_format' };
    const [data, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    if (expected !== sig) return { ok: false, reason: 'bad_signature' };

    let payload: unknown;
    try {
        payload = JSON.parse(base64UrlDecode(data));
    } catch {
        return { ok: false, reason: 'bad_payload' };
    }

    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'bad_payload' };
    const p = payload as Partial<GameAuthTokenPayload>;

    if (p.v !== 1) return { ok: false, reason: 'bad_version' };
    if (!p.telegramId || !p.nickname || !p.roomId || !p.exp) return { ok: false, reason: 'missing_fields' };
    if (typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };

    return { ok: true, payload: p as GameAuthTokenPayload };
};

type AuthContext = {
    telegramId: number;
    nickname: string;
    username?: string;
    avatarUrl?: string;
    roomId: string;
    chatId?: string;
};

const games = new Map<string, GameState>();
const authBySocketId = new Map<string, AuthContext>();

export const config = {
    api: {
        bodyParser: false,
    },
};

const TURN_TIME_LIMIT_MS = 20000;

const firstValue = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    return undefined;
};

const getPlayerSymbol = (player: Player): 'X' | 'O' => (player.isAttacker ? 'X' : 'O');

const findPlayerBySocket = (game: GameState, socketId: string): Player | null => {
    if (game.players.attacker?.socketId === socketId) return game.players.attacker;
    if (game.players.defender?.socketId === socketId) return game.players.defender;
    return null;
};

const findPlayerByTelegramId = (game: GameState, telegramId: number): Player | null => {
    if (game.players.attacker?.telegramId === telegramId) return game.players.attacker;
    if (game.players.defender?.telegramId === telegramId) return game.players.defender;
    return null;
};

const createPlayer = (ctx: AuthContext, socketId: string, isAttacker: boolean): Player => ({
    id: String(ctx.telegramId),
    socketId,
    telegramId: ctx.telegramId,
    nickname: ctx.nickname,
    username: ctx.username,
    avatarUrl: ctx.avatarUrl,
    isAttacker,
    score: 0,
});

const createNewGame = (roomId: string, ctx: AuthContext, socketId: string): GameState => ({
    currentPlayer: 'X',
    cells: {},
    winner: null,
    isYourTurn: false,
    status: 'waiting',
    turnTimeLimit: TURN_TIME_LIMIT_MS,
    turnStartTime: undefined,
    players: {
        attacker: createPlayer(ctx, socketId, true),
    },
    readyForNewGame: {},
    createdAt: Date.now(),
    roomChatId: ctx.chatId,
});

const emitGameState = (io: Server, roomId: string, game: GameState) => {
    const attacker = game.players.attacker;
    const defender = game.players.defender;
    if (!attacker) return;

    io.to(attacker.socketId).emit('gameState', {
        ...game,
        playerSymbol: 'X',
        isYourTurn: game.currentPlayer === 'X',
    });

    if (defender) {
        io.to(defender.socketId).emit('gameState', {
            ...game,
            playerSymbol: 'O',
            isYourTurn: game.currentPlayer === 'O',
        });
    }

    io.to(roomId).emit('gameStarted', { roomId });
};

const checkWinner = (
    cells: { [key: string]: CellValue },
    x: number,
    y: number,
    player: 'X' | 'O',
): CellValue => {
    const directions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
    ];

    for (const [dx, dy] of directions) {
        let count = 1;

        for (let i = 1; i < 5; i++) {
            if (cells[`${x + dx * i},${y + dy * i}`] !== player) break;
            count++;
        }

        for (let i = 1; i < 5; i++) {
            if (cells[`${x - dx * i},${y - dy * i}`] !== player) break;
            count++;
        }

        if (count >= 5) return player;
    }

    return null;
};

const emitInterruption = (io: Server, roomId: string, game: GameState, message: string) => {
    io.to(roomId).emit('gameInterrupted', {
        message,
        attackerScore: game.players.attacker?.score || 0,
        defenderScore: game.players.defender?.score || 0,
        attackerName: game.players.attacker?.nickname || 'Игрок 1',
        defenderName: game.players.defender?.nickname || 'Игрок 2',
    });
};

const handler = async (_req: NextApiRequest, res: NextApiResponseWithSocket) => {
    if (!res.socket.server.io) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const httpServer: NetServer = res.socket.server as any;
        const io = new Server(httpServer, {
            path: `${APP_URL}/api/socket`,
        });

        io.on('connection', async (socket) => {
            const initData = firstValue(socket.handshake.auth?.initData) || firstValue(socket.handshake.query.initData);
            const authToken = firstValue(socket.handshake.auth?.authToken) || firstValue(socket.handshake.query.authToken);
            const authSecret = process.env.TELEGRAM_GAME_AUTH_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';

            const validated = initData ? validateTelegramInitData(initData || '') : { isValid: false, reason: 'missing_init_data' as const };
            const tokenValidated = authToken && authSecret ? verifyAuthToken(String(authToken), authSecret) : null;

            const roomIdFromHandshake = firstValue(socket.handshake.auth?.roomId) || firstValue(socket.handshake.query.roomId);
            const chatIdFromHandshake =
                firstValue(socket.handshake.auth?.chatId) ||
                firstValue(socket.handshake.query.chatId) ||
                firstValue(socket.handshake.query.tgChatId);

            const roomIdFromInitData = validated.isValid ? validated.startParam || validated.chatInstance : undefined;
            const roomIdFromToken = tokenValidated && tokenValidated.ok ? tokenValidated.payload.roomId : undefined;

            const resolvedRoomId = roomIdFromHandshake || roomIdFromInitData || roomIdFromToken;

            const authContext: AuthContext | null = (() => {
                if (validated.isValid && validated.user) {
                    if (!resolvedRoomId) return null;

                    const nickname = `${validated.user.first_name}${validated.user.last_name ? ` ${validated.user.last_name}` : ''}`;
                    return {
                        telegramId: validated.user.id,
                        nickname,
                        username: validated.user.username,
                        avatarUrl: validated.user.photo_url,
                        roomId: resolvedRoomId,
                        chatId: chatIdFromHandshake,
                    };
                }

                if (tokenValidated && tokenValidated.ok) {
                    return {
                        telegramId: tokenValidated.payload.telegramId,
                        nickname: tokenValidated.payload.nickname,
                        username: tokenValidated.payload.username,
                        avatarUrl: undefined,
                        roomId: tokenValidated.payload.roomId,
                        chatId: tokenValidated.payload.chatId || chatIdFromHandshake,
                    };
                }

                return null;
            })();

            if (!authContext || !authContext.telegramId) {
                console.warn('Telegram auth failed', {
                    socketId: socket.id,
                    initDataReason: validated.reason,
                    hasInitData: Boolean(initData),
                    initDataLength: initData ? String(initData).length : 0,
                    hasAuthToken: Boolean(authToken),
                    authTokenReason: tokenValidated && !tokenValidated.ok ? tokenValidated.reason : undefined,
                });
                socket.emit('error', { message: 'Не удалось подтвердить Telegram-авторизацию' });
                socket.disconnect();
                return;
            }

            if (!authContext.avatarUrl) {
                const avatarUrl = await getTelegramAvatarUrl(authContext.telegramId);
                if (avatarUrl) {
                    authContext.avatarUrl = avatarUrl;
                }
            }

            const roomId = resolvedRoomId || authContext.roomId;

            if (!roomId) {
                socket.emit('error', { message: 'Не передан идентификатор игровой комнаты' });
                socket.disconnect();
                return;
            }

            const chatId =
                firstValue(socket.handshake.auth?.chatId) ||
                firstValue(socket.handshake.query.chatId) ||
                firstValue(socket.handshake.query.tgChatId) ||
                authContext.chatId;

            authContext.roomId = roomId;
            authContext.chatId = chatId;

            authBySocketId.set(socket.id, authContext);
            socket.join(roomId);

            const existingGame = games.get(roomId);
            if (!existingGame) {
                const game = createNewGame(roomId, authContext, socket.id);
                games.set(roomId, game);
                socket.emit('waitingForOpponent');
                socket.emit('gameState', {
                    ...game,
                    playerSymbol: 'X',
                    isYourTurn: false,
                });
            } else {
                const existingPlayer = findPlayerByTelegramId(existingGame, authContext.telegramId);

                if (existingPlayer) {
                    existingPlayer.socketId = socket.id;
                    existingPlayer.nickname = authContext.nickname;
                    existingPlayer.username = authContext.username;
                    existingPlayer.avatarUrl = authContext.avatarUrl;
                    emitGameState(io, roomId, existingGame);
                } else if (existingGame.status === 'waiting' && !existingGame.players.defender) {
                    existingGame.players.defender = createPlayer(authContext, socket.id, false);
                    existingGame.status = 'playing';
                    existingGame.turnStartTime = Date.now();
                    existingGame.roomChatId = existingGame.roomChatId || authContext.chatId;
                    emitGameState(io, roomId, existingGame);
                    void notifyOpponentJoined(existingGame.roomChatId, authContext.nickname);

                    const initiator = getRoomInitiator(roomId);
                    const targetTelegramId = initiator?.telegramId || existingGame.players.attacker?.telegramId;
                    if (targetTelegramId) {
                        void sendOpenGameButtonToUser(targetTelegramId, roomId);
                    }
                } else {
                    socket.emit('error', { message: 'Комната уже занята' });
                    socket.disconnect();
                    return;
                }
            }

            socket.on('readyForNewGame', ({ roomId: eventRoomId }) => {
                const targetRoomId = firstValue(eventRoomId) || authContext.roomId;
                const game = games.get(targetRoomId);
                if (!game || !game.players.attacker || !game.players.defender) return;

                const currentPlayer = findPlayerBySocket(game, socket.id);
                if (!currentPlayer) return;

                const oldAttacker = game.players.attacker;
                const oldDefender = game.players.defender;

                const attackerNext = currentPlayer.isAttacker ? oldAttacker : { ...oldDefender, isAttacker: true };
                const defenderNext = currentPlayer.isAttacker ? oldDefender : { ...oldAttacker, isAttacker: false };

                const newGame: GameState = {
                    ...game,
                    players: {
                        attacker: attackerNext,
                        defender: defenderNext,
                    },
                    cells: {},
                    currentPlayer: 'X',
                    winner: null,
                    status: 'playing',
                    lastMove: undefined,
                    turnStartTime: Date.now(),
                    finishedAt: undefined,
                    historySaved: false,
                };

                games.set(targetRoomId, newGame);
                emitGameState(io, targetRoomId, newGame);
            });

            socket.on('move', ({ x, y, roomId: eventRoomId }) => {
                const targetRoomId = firstValue(eventRoomId) || authContext.roomId;
                const game = games.get(targetRoomId);
                if (!game || game.status !== 'playing') return;

                if (!Number.isInteger(x) || !Number.isInteger(y)) {
                    socket.emit('error', { message: 'Некорректные координаты хода' });
                    return;
                }

                const player = findPlayerBySocket(game, socket.id);
                if (!player) {
                    socket.emit('error', { message: 'Игрок не принадлежит этой партии' });
                    return;
                }

                const expectedSymbol = getPlayerSymbol(player);
                if (expectedSymbol !== game.currentPlayer) {
                    socket.emit('error', { message: 'Сейчас не ваш ход' });
                    return;
                }

                const cellKey = `${x},${y}`;
                if (game.cells[cellKey]) {
                    socket.emit('error', { message: 'Клетка уже занята' });
                    return;
                }

                game.cells[cellKey] = expectedSymbol;
                game.lastMove = { x, y, player: expectedSymbol };

                const winner = checkWinner(game.cells, x, y, expectedSymbol);
                if (winner) {
                    game.winner = winner;
                    game.status = 'finished';
                    game.finishedAt = Date.now();

                    if (winner === 'X') {
                        game.players.attacker!.score += 1;
                    } else {
                        game.players.defender!.score += 1;
                    }

                    emitGameState(io, targetRoomId, game);
                    void saveGameHistory(game, targetRoomId, 'win');
                    return;
                }

                game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
                game.turnStartTime = Date.now();
                emitGameState(io, targetRoomId, game);
            });

            socket.on('turnTimeout', ({ roomId: eventRoomId }) => {
                const targetRoomId = firstValue(eventRoomId) || authContext.roomId;
                const game = games.get(targetRoomId);
                if (!game || game.status !== 'playing') return;

                const player = findPlayerBySocket(game, socket.id);
                if (!player) return;

                const expectedSymbol = getPlayerSymbol(player);
                if (expectedSymbol !== game.currentPlayer) {
                    return;
                }

                if (game.turnStartTime && Date.now() - game.turnStartTime > game.turnTimeLimit) {
                    const timeoutPlayerName = player.nickname;
                    game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
                    game.turnStartTime = Date.now();
                    io.to(targetRoomId).emit('turnTimeout', { player: timeoutPlayerName });
                    emitGameState(io, targetRoomId, game);
                }
            });

            socket.on('leaveGame', ({ roomId: eventRoomId }) => {
                const targetRoomId = firstValue(eventRoomId) || authContext.roomId;
                const game = games.get(targetRoomId);
                if (!game) return;

                const player = findPlayerBySocket(game, socket.id);
                if (!player) return;

                game.finishedAt = Date.now();
                emitInterruption(io, targetRoomId, game, `Игрок ${player.nickname} прервал игру`);
                void saveGameHistory(game, targetRoomId, 'leave');
                games.delete(targetRoomId);
            });

            socket.on('disconnect', () => {
                const disconnectedAuth = authBySocketId.get(socket.id);
                authBySocketId.delete(socket.id);
                if (!disconnectedAuth) return;

                const game = games.get(disconnectedAuth.roomId);
                if (!game) return;

                const disconnectedPlayer = findPlayerBySocket(game, socket.id);
                if (!disconnectedPlayer) return;

                game.finishedAt = Date.now();
                emitInterruption(io, disconnectedAuth.roomId, game, `Игрок ${disconnectedPlayer.nickname} отключился`);
                void saveGameHistory(game, disconnectedAuth.roomId, 'disconnect');
                games.delete(disconnectedAuth.roomId);
            });
        });

        res.socket.server.io = io;
    }

    res.end();
};

export default handler;
