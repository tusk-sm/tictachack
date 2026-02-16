'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import GameBoard from '../components/GameBoard';
import PlayerInfo from '../components/PlayerInfo';
import { GameState } from '../types/game';
import {APP_URL} from '../../constants';

declare global {
    interface Window {
        Telegram: {
            WebApp: {
                ready(): void;
                initData: string;
                initDataUnsafe: {
                    user?: {
                        id: number;
                        first_name: string;
                        last_name?: string;
                        username?: string;
                        photo_url?: string;
                        language_code?: string;
                    };
                };
            };
        };
    }
}

let socket: Socket;

function Home() {
    const searchParams = useSearchParams();
    const [roomId, setRoomId] = useState<string>('');
    const [roomResolved, setRoomResolved] = useState(false);
    const [waitingForOpponent, setWaitingForOpponent] = useState(false);
    const [showTimeoutMessage, setShowTimeoutMessage] = useState<string | null>(null);
    const [startupError, setStartupError] = useState<string | null>(null);
    const [telegramUser, setTelegramUser] = useState<typeof window.Telegram.WebApp.initDataUnsafe.user | null>(null);


    const [gameInterruptedInfo, setGameInterruptedInfo] = useState<{
        message: string;
        attackerScore: number;
        defenderScore: number;
        attackerName: string;
        defenderName: string;
    } | null>(null);

    const [gameState, setGameState] = useState<GameState>({
        currentPlayer: 'X',
        cells: {},
        winner: null,
        isYourTurn: false,
        status: 'waiting',
        players: {},
        turnTimeLimit: 20000 // 20 секунд
    });
    const [turnTimeLeft, setTurnTimeLeft] = useState<number>(20000);


    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg) {
            setStartupError('Игра должна быть открыта из Telegram через бота.');
            setRoomResolved(true);
            return;
        }

        if (!tg.initData) {
            setStartupError('Telegram не передал данные авторизации (initData). Откройте игру через бота (WebApp).');
            setRoomResolved(true);
            return;
        }

        tg.ready();
        const user = tg.initDataUnsafe.user;
        if (user) {
            setTelegramUser(user);
        }

        const roomFromUrl = searchParams?.get('room') || searchParams?.get('tgWebAppStartParam') || '';
        if (!roomFromUrl) {
            setStartupError('Не передан roomId. Откройте игру из карточки Telegram Game.');
            setRoomResolved(true);
            return;
        }

        const chatId = searchParams?.get('chat_id') || searchParams?.get('chatId') || undefined;

        setRoomId(roomFromUrl);
        setRoomResolved(true);
        setStartupError(null);

        if (!socket) {
            socket = io({
                path: `${APP_URL}/api/socket`,
                auth: {
                    initData: tg.initData,
                    roomId: roomFromUrl,
                    chatId,
                }
            });

            socket.on('connect', () => {
                console.log('Connected to server with id:', socket.id);
            });

            socket.on('gameState', (state: GameState) => {
                setWaitingForOpponent(state.status === 'waiting');
                setGameState(state);
                if (state.turnStartTime) {
                    const timeLeft = state.turnTimeLimit - (Date.now() - state.turnStartTime);
                    setTurnTimeLeft(Math.max(0, timeLeft));
                }
            });

            socket.on('gameStarted', ({ roomId }) => {
                setRoomId(roomId);
                setWaitingForOpponent(false);
            });

            socket.on('turnTimeout', ({ player }) => {
                setShowTimeoutMessage(`Время хода ${player} истекло!`);
                setTimeout(() => setShowTimeoutMessage(null), 3000);
            });

            socket.on('playerDisconnected', () => {
                alert('Противник отключился');
                window.location.href = '/';
            });

            socket.on('gameInterrupted', (info) => {
                console.log('Game interrupted:', info);
                setGameInterruptedInfo(info);
                // Сбрасываем состояние игры
                setGameState({
                    currentPlayer: 'X',
                    cells: {},
                    winner: null,
                    isYourTurn: false,
                    status: 'waiting',
                    players: {},
                    turnTimeLimit: 20000
                });
                setRoomId('');
                setWaitingForOpponent(false);
            });

            socket.on('waitingForOpponent', () => {
                setWaitingForOpponent(true);
            });

            socket.on('error', ({ message }) => {
                console.error('Game error:', message);
                alert(message);
                setWaitingForOpponent(false);
            });
        }

        return () => {
            if (socket) {
                socket.disconnect();
            }
        };
    }, [searchParams]);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (gameState.isYourTurn && gameState.turnStartTime) {
            const startTime = gameState.turnStartTime;
            timer = setInterval(() => {
                const timeLeft = gameState.turnTimeLimit - (Date.now() - startTime);
                setTurnTimeLeft(Math.max(0, timeLeft));
                if (timeLeft <= 0) {
                    socket.emit('turnTimeout', { roomId });
                    clearInterval(timer);
                }
            }, 100);
        }
        return () => clearInterval(timer);
    }, [gameState.isYourTurn, gameState.turnStartTime, gameState.turnTimeLimit, roomId]);

    const handleNewGame = () => {
        socket.emit('readyForNewGame', { roomId });
    };

    const handleMove = (x: number, y: number) => {
        if (gameState.isYourTurn && !gameState.winner && turnTimeLeft > 0) {
            socket.emit('move', {
                x,
                y,
                roomId
            });
        }
    };

    const handleReturnToMenu = () => {
        // Отправляем сообщение серверу о выходе из игры
        if (roomId && socket && socket.connected) {
            console.log('Отправляем событие leaveGame для комнаты:', roomId);
            socket.emit('leaveGame', { roomId });
        } else {
            console.log('Нет активной игры или соединения, просто сбрасываем состояние');
            // Если нет активной игры, просто сбрасываем состояние
            setGameState({
                currentPlayer: 'X',
                cells: {},
                winner: null,
                isYourTurn: false,
                status: 'waiting',
                players: {},
                turnTimeLimit: 20000
            });
            setRoomId('');
            setWaitingForOpponent(false);
        }
    };

    const currentPlayer = gameState.players.attacker?.id === telegramUser?.id?.toString() 
        ? gameState.players.attacker 
        : gameState.players.defender;
    
    const opponent = gameState.players.attacker?.id === telegramUser?.id?.toString() 
        ? gameState.players.defender 
        : gameState.players.attacker;

    // console.log('Current render state:', {
    //     roomId,
    //     gameStatus: gameState.status,
    //     isSearching: isSearchingGame,
    //     currentPlayer,
    //     opponent,
    //     socketId: socket?.id
    // });

    if (!roomResolved) {
        return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Подготовка игры...</div>;
    }

    if (startupError || !roomId) {
        return (
            <div className="relative min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
                
                 {/* Модальное окно с информацией о прерывании игры */}
            {gameInterruptedInfo && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
                        <h2 className="text-xl font-bold mb-4">Игра прервана</h2>
                        <p className="mb-4">{gameInterruptedInfo.message}</p>
                        <div className="mb-4">
                            <h3 className="font-semibold mb-2">Счёт:</h3>
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="font-medium">{gameInterruptedInfo.attackerName}</span>: {gameInterruptedInfo.attackerScore}
                                </div>
                                <div>
                                    <span className="font-medium">{gameInterruptedInfo.defenderName}</span>: {gameInterruptedInfo.defenderScore}
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => setGameInterruptedInfo(null)} 
                            className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-md transition-colors"
                        >
                            Вернуться в меню
                        </button>
                    </div>
                </div>
            )}

            {/* Логотип и название игры */}
            <div className="mb-12 text-center">
                    {/* SVG логотип
                    <svg 
                        className="w-32 h-32 mx-auto mb-4" 
                        viewBox="0 0 100 100" 
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#4F46E5" strokeWidth="5" />
                        <line x1="30" y1="30" x2="70" y2="70" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
                        <line x1="70" y1="30" x2="30" y2="70" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
                        <circle cx="20" cy="50" r="8" fill="#F59E0B" />
                        <circle cx="80" cy="50" r="8" fill="#F59E0B" />
                        <circle cx="50" cy="20" r="8" fill="#F59E0B" />
                        <circle cx="50" cy="80" r="8" fill="#F59E0B" />
                    </svg> */}
                    
                    <h1 className="text-4xl font-bold mb-2 text-gradient bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-green-500">
                        Крестики-Нолики <br/> 5 в ряд
                    </h1>
                    <p className="text-gray-400 mb-8">Классическая игра на бесконечном поле</p>
                </div>
                
                <div className="text-center max-w-md px-4">
                    <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
                        <h2 className="text-2xl font-bold mb-2">Не удалось запустить матч</h2>
                        <p className="text-gray-400">{startupError || 'Откройте игру из Telegram-бота.'}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <Suspense>  
        <div className="relative min-h-screen bg-gray-900 text-white">
            {showTimeoutMessage && (
                <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                    bg-red-600 text-white px-6 py-3 rounded-lg text-xl z-50">
                    {showTimeoutMessage}
                </div>
            )}
            
            {currentPlayer && (
                <div className="fixed top-4 left-4 bg-gray-800 rounded p-2 z-50">
                    <PlayerInfo
                        nickname={`${currentPlayer.nickname} (${currentPlayer.score})`}
                        avatarUrl={currentPlayer.avatarUrl}
                        isCurrentTurn={gameState.isYourTurn}
                        isAttacker={currentPlayer.isAttacker}
                        position="top"
                    />
                </div>
            )}
            {opponent && (
                <div className="fixed bottom-4 left-4 bg-gray-800 rounded p-2 z-50">
                    <PlayerInfo
                        nickname={`${opponent.nickname} (${opponent.score})`}
                        avatarUrl={opponent.avatarUrl}
                        isCurrentTurn={!gameState.isYourTurn}
                        isAttacker={opponent.isAttacker}
                        position="bottom"
                    />
                </div>
            )}
            
            <div className="h-screen">
                {waitingForOpponent || gameState.status === 'waiting' ? (
                    <div className="text-center text-xl">
                        Ожидание подключения соперника...
                    </div>
                ) : (
                    <GameBoard
                        cells={gameState.cells}
                        onCellClick={handleMove}
                        isYourTurn={gameState.isYourTurn}
                        playerSymbol={gameState.playerSymbol}
                        lastMove={gameState.lastMove}
                        turnTimeLeft={gameState.isYourTurn ? turnTimeLeft : undefined}
                        onReturnToMenu={handleReturnToMenu}
                    />
                )}
                
                {gameState.winner && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-gray-800 p-8 rounded-lg text-center">
                            <h2 className="text-3xl font-bold mb-4">
                                {(gameState.winner === 'X' && currentPlayer?.isAttacker) || 
                                 (gameState.winner === 'O' && !currentPlayer?.isAttacker)
                                    ? 'Вы победили!' 
                                    : 'Вы проиграли!'}
                            </h2>
                            <div className="text-xl mb-4">
                                Счет: {currentPlayer?.nickname} ({currentPlayer?.score}) - {opponent?.nickname} ({opponent?.score})
                            </div>
                            <button
                                onClick={handleNewGame}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                            >
                                Играть снова
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
        </Suspense>
    );
}

const App = () => {
    return (
        <Suspense fallback={<div>Загрузка...</div>}>
            <Home />
        </Suspense>
    );
};

export default App;
