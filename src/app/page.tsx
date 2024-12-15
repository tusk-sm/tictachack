'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import GameBoard from '../components/GameBoard';
import PlayerInfo from '../components/PlayerInfo';
import GameInvite from '../components/GameInvite';
import { GameState, Player, GameMove } from '../types/game';

let socket: Socket;

export default function Home() {
    const searchParams = useSearchParams();
    const [roomId, setRoomId] = useState<string>('');
    const [showInvite, setShowInvite] = useState(false);
    const [showTimeoutMessage, setShowTimeoutMessage] = useState<string | null>(null);
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
        const roomFromUrl = searchParams.get('room');
        
        if (!socket) {
            socket = io({
                path: '/api/socket',
            });

            socket.on('connect', () => {
                console.log('Connected to server');
            });

            socket.on('gameState', (state: GameState) => {
                setGameState(state);
                if (state.turnStartTime) {
                    const timeLeft = state.turnTimeLimit - (Date.now() - state.turnStartTime);
                    setTurnTimeLeft(Math.max(0, timeLeft));
                }
            });

            socket.on('turnTimeout', ({ player }) => {
                setShowTimeoutMessage(`Время хода ${player} истекло!`);
                setTimeout(() => setShowTimeoutMessage(null), 3000);
            });

            socket.on('playerDisconnected', () => {
                alert('Противник отключился');
                window.location.href = '/';
            });
        }

        if (roomFromUrl) {
            socket.emit('joinGame', { roomId: roomFromUrl });
            setRoomId(roomFromUrl);
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
            timer = setInterval(() => {
                const timeLeft = gameState.turnTimeLimit - (Date.now() - gameState.turnStartTime);
                setTurnTimeLeft(Math.max(0, timeLeft));
                if (timeLeft <= 0) {
                    socket.emit('turnTimeout', { roomId });
                    clearInterval(timer);
                }
            }, 100);
        }
        return () => clearInterval(timer);
    }, [gameState.isYourTurn, gameState.turnStartTime, gameState.turnTimeLimit, roomId]);

    const handleCreateGame = () => {
        socket.emit('createGame');
        socket.once('gameCreated', ({ roomId, gameState }: { roomId: string, gameState: GameState }) => {
            setRoomId(roomId);
            setGameState(gameState);
            setShowInvite(true);
        });
    };

    const handleNewGame = () => {
        socket.emit('readyForNewGame', { roomId });
    };

    const handleMove = (x: number, y: number) => {
        if (gameState.isYourTurn && !gameState.winner && turnTimeLeft > 0) {
            socket.emit('move', {
                x,
                y,
                player: gameState.playerSymbol,
                roomId
            });
        }
    };

    const currentPlayer = gameState.players.attacker?.id === socket?.id 
        ? gameState.players.attacker 
        : gameState.players.defender;
    
    const opponent = gameState.players.attacker?.id === socket?.id 
        ? gameState.players.defender 
        : gameState.players.attacker;

    if (!roomId) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                <button
                    onClick={handleCreateGame}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xl transition-colors"
                >
                    Создать игру
                </button>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-gray-900 text-white">
            {showInvite && <GameInvite roomId={roomId} />}
            
            {showTimeoutMessage && (
                <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                    bg-red-600 text-white px-6 py-3 rounded-lg text-xl z-50">
                    {showTimeoutMessage}
                </div>
            )}
            
            {currentPlayer && (
                <div className="fixed top-4 left-4 bg-gray-800 rounded p-2">
                    <PlayerInfo
                        nickname={`${currentPlayer.nickname} (${currentPlayer.score})`}
                        isCurrentTurn={gameState.isYourTurn}
                        isAttacker={currentPlayer.isAttacker}
                        position="top"
                    />
                </div>
            )}
            {opponent && (
                <div className="fixed bottom-4 left-4 bg-gray-800 rounded p-2">
                    <PlayerInfo
                        nickname={`${opponent.nickname} (${opponent.score})`}
                        isCurrentTurn={!gameState.isYourTurn}
                        isAttacker={opponent.isAttacker}
                        position="bottom"
                    />
                </div>
            )}
            
            <div className="pt-20 pb-20">
                {gameState.status === 'waiting' ? (
                    <div className="text-center text-xl">
                        Waiting for opponent to join...
                    </div>
                ) : (
                    <>
                        <div className="max-w-screen-sm mx-auto">
                            <GameBoard
                                cells={gameState.cells}
                                onCellClick={handleMove}
                                isYourTurn={gameState.isYourTurn}
                                playerSymbol={gameState.playerSymbol}
                                lastMove={gameState.lastMove}
                                turnTimeLeft={gameState.isYourTurn ? turnTimeLeft : undefined}
                            />
                        </div>
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
                    </>
                )}
            </div>
        </div>
    );
}
