import { Server } from 'socket.io';
import { Server as NetServer } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';
// import { NextApiResponseWithSocket } from '../../types/next';
import { GameState, GameMove, CellValue } from '../../types/game';


import {APP_URL} from '../../../constants';

export type NextApiResponseWithSocket = NextApiResponse & {
    socket: {
        server: NetServer & {
            io: Server
        }
    }
}

const games = new Map<string, GameState>();

export const config = {
    api: {
        bodyParser: false,
    },
};

const generateRoomId = () => Math.random().toString(36).substring(2, 8);

const createNewGame = (playerId: string): [string, GameState] => {
    const roomId = generateRoomId();
    const gameState: GameState = {
        currentPlayer: 'X',
        cells: {},
        winner: null,
        isYourTurn: false,
        status: 'waiting',
        turnTimeLimit: 20000,
        turnStartTime: undefined,
        players: {
            attacker: {
                id: playerId,
                nickname: 'Heker',
                isAttacker: true,
                score: 0
            }
        },
        readyForNewGame: {}
    };
    games.set(roomId, gameState);
    return [roomId, gameState];
};

const joinGame = (roomId: string, playerId: string): GameState | null => {
    const game = games.get(roomId);
    if (!game || game.status !== 'waiting') return null;

    game.players.defender = {
        id: playerId,
        nickname: 'Beluga',
        isAttacker: false,
        score: 0
    };
    game.status = 'playing';
    game.turnStartTime = Date.now();

    return game;
};

// const startNewRound = (game: GameState, firstReadyPlayerId: string): GameState => {
//     // Определяем, кто будет атакующим в новой игре (тот, кто первый нажал "Играть снова")
//     const oldAttacker = game.players.attacker!;
//     const oldDefender = game.players.defender!;

//     // Определяем, кто первый нажал кнопку
//     const firstPlayer = firstReadyPlayerId === oldAttacker.id ? oldAttacker : oldDefender;
//     const secondPlayer = firstReadyPlayerId === oldAttacker.id ? oldDefender : oldAttacker;

//     // Сбрасываем состояние игры
//     const newGame: GameState = {
//         ...game,
//         cells: {},
//         currentPlayer: 'X',
//         winner: null,
//         status: 'playing',
//         lastMove: null,
//         turnStartTime: Date.now(),
//         readyForNewGame: {},
//         // Первый нажавший становится атакующим
//         players: {
//             attacker: {
//                 ...firstPlayer,
//                 isAttacker: true,
//                 nickname: 'Heker'
//             },
//             defender: {
//                 ...secondPlayer,
//                 isAttacker: false,
//                 nickname: 'Beluga'
//             }
//         }
//     };

//     return newGame;
// };

const checkWinner = (cells: { [key: string]: CellValue } , lastMove: GameMove): CellValue => {
    
    const directions = [
        [0, 1],   // horizontal
        [1, 0],   // vertical
        [1, 1],   // diagonal
        [1, -1],  // other diagonal
    ];

    const { x, y, player } = lastMove;

    for (const [dx, dy] of directions) {
        let count = 1;
        
        // Check in positive direction
        for (let i = 1; i < 5; i++) {
            const key = `${x + dx * i},${y + dy * i}`;
            if (cells[key] !== player) break;
            count++;
        }
        
        // Check in negative direction
        for (let i = 1; i < 5; i++) {
            const key = `${x - dx * i},${y - dy * i}`;
            if (cells[key] !== player) break;
            count++;
        }

        if (count >= 5) return player;
    }

    return null;
};

const handler = async (req: NextApiRequest, res: NextApiResponseWithSocket) => {
    if (!res.socket.server.io) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const httpServer: NetServer = res.socket.server as any;
        const io = new Server(httpServer, {
            path: `${APP_URL}/api/socket`,
        });

        io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            socket.on('createGame', () => {                
                const [roomId, gameState] = createNewGame(socket.id);
                socket.join(roomId);
                socket.emit('gameCreated', { roomId, gameState });
            });

            socket.on('joinGame', ({ roomId }) => {
                const gameState = joinGame(roomId, socket.id);
                if (gameState) {
                    socket.join(roomId);
                    
                    // Отправляем состояние атакующему игроку
                    io.to(gameState.players.attacker!.id).emit('gameState', {
                        ...gameState,
                        playerSymbol: 'X',
                        isYourTurn: true
                    });

                    // Отправляем состояние защищающемуся игроку
                    socket.emit('gameState', {
                        ...gameState,
                        playerSymbol: 'O',
                        isYourTurn: false
                    });
                } else {
                    socket.emit('error', 'Game not found or already started');
                }
            });

            socket.on('readyForNewGame', ({ roomId }) => {
                const game = games.get(roomId);
                if (!game) return;

                // Создаем новую игру
                const newGame: GameState = {
                    ...game,
                    cells: {},
                    currentPlayer: 'X',
                    winner: null,
                    status: 'playing',
                    lastMove: undefined,
                    turnStartTime: Date.now()
                };

                // Нажавший кнопку становится атакующим
                const oldAttacker = game.players.attacker!;
                const oldDefender = game.players.defender!;

                if (socket.id === oldAttacker.id) {
                    // Атакующий остается атакующим
                    newGame.players = {
                        attacker: oldAttacker,
                        defender: oldDefender
                    };
                } else {
                    // Защищающийся становится атакующим
                    newGame.players = {
                        attacker: {
                            ...oldDefender,
                            isAttacker: true,
                            nickname: 'Heker'
                        },
                        defender: {
                            ...oldAttacker,
                            isAttacker: false,
                            nickname: 'Beluga'
                        }
                    };
                }

                games.set(roomId, newGame);

                // Отправляем обновленное состояние обоим игрокам
                io.to(newGame.players.attacker!.id).emit('gameState', {
                    ...newGame,
                    playerSymbol: 'X',
                    isYourTurn: true
                });

                io.to(newGame.players.defender!.id).emit('gameState', {
                    ...newGame,
                    playerSymbol: 'O',
                    isYourTurn: false
                });
            });

            socket.on('move', ({ x, y, player, roomId }) => {
                const game = games.get(roomId);
                if (!game || game.status !== 'playing') return;

                const cellKey = `${x},${y}`;
                if (game.cells[cellKey]) return;

                game.cells[cellKey] = player;
                game.lastMove = { x, y, player };

                const winner = checkWinner(game.cells, { x, y, player, roomId });
                if (winner) {
                    game.winner = winner;
                    game.status = 'finished';
                    
                    // Обновляем счет
                    if (winner === 'X') {
                        game.players.attacker!.score = (game.players.attacker!.score || 0) + 1;
                    } else {
                        game.players.defender!.score = (game.players.defender!.score || 0) + 1;
                    }
                } else {
                    game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
                    game.turnStartTime = Date.now();
                }

                // Отправляем обновленное состояние обоим игрокам
                io.to(game.players.attacker!.id).emit('gameState', {
                    ...game,
                    playerSymbol: 'X',
                    isYourTurn: game.currentPlayer === 'X'
                });

                io.to(game.players.defender!.id).emit('gameState', {
                    ...game,
                    playerSymbol: 'O',
                    isYourTurn: game.currentPlayer === 'O'
                });
            });

            socket.on('turnTimeout', ({ roomId }) => {
                const game = games.get(roomId);
                if (!game || game.status !== 'playing') return;

                // Проверяем, действительно ли время истекло
                if (game.turnStartTime && Date.now() - game.turnStartTime > game.turnTimeLimit) {
                    // Определяем, чей ход был
                    const timeoutPlayer = game.currentPlayer === 'X' ? 'Heker' : 'Beluga';
                    
                    // Передаем ход другому игроку
                    game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
                    game.turnStartTime = Date.now();

                    // Отправляем уведомление всем игрокам
                    io.to(roomId).emit('turnTimeout', { player: timeoutPlayer });

                    // Отправляем обновленное состояние обоим игрокам
                    io.to(game.players.attacker!.id).emit('gameState', {
                        ...game,
                        playerSymbol: 'X',
                        isYourTurn: game.currentPlayer === 'X'
                    });

                    io.to(game.players.defender!.id).emit('gameState', {
                        ...game,
                        playerSymbol: 'O',
                        isYourTurn: game.currentPlayer === 'O'
                    });
                }
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                games.forEach((game, roomId) => {
                    if (game.players.attacker?.id === socket.id || game.players.defender?.id === socket.id) {
                        io.to(roomId).emit('playerDisconnected', {
                            message: 'Opponent disconnected'
                        });
                        games.delete(roomId);
                    }
                });
            });
        });

        res.socket.server.io = io;
    }
    res.end();
};

export default handler;
