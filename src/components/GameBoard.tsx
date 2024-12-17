import React, { useState, useEffect, useRef } from 'react';
import { CellValue } from '../types/game';
import ServerIcon from './ServerIcon';

interface GameBoardProps {
    cells: { [key: string]: CellValue };
    onCellClick: (x: number, y: number) => void;
    isYourTurn: boolean;
    playerSymbol?: 'X' | 'O';
    lastMove?: { x: number; y: number; player: 'X' | 'O' };
    turnTimeLeft?: number;
}

const GameBoard: React.FC<GameBoardProps> = ({ 
    cells = {}, 
    onCellClick, 
    isYourTurn,
    playerSymbol,
    lastMove,
    turnTimeLeft 
}) => {
    const [viewportPosition, setViewportPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isAnimatingMove, setIsAnimatingMove] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    
    const cellSize = 60;

    useEffect(() => {
        if (containerRef.current) {
            const container = containerRef.current;
            setViewportPosition({
                x: container.clientWidth / 2,
                y: container.clientHeight / 2
            });
        }
    }, []);

    useEffect(() => {
        if (lastMove && isAnimatingMove) {
            const container = containerRef.current;
            if (!container) return;

            const targetX = container.clientWidth / 2 - lastMove.x * cellSize;
            const targetY = container.clientHeight / 2 - lastMove.y * cellSize;
            
            // Анимируем перемещение к последнему ходу
            const startX = viewportPosition.x;
            const startY = viewportPosition.y;
            const startTime = performance.now();
            const duration = 1000; // 1 секунда на анимацию

            const animate = (currentTime: number) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Функция плавности (ease-in-out)
                const easeProgress = progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

                setViewportPosition({
                    x: startX + (targetX - startX) * easeProgress,
                    y: startY + (targetY - startY) * easeProgress
                });

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    setIsAnimatingMove(false);
                }
            };

            requestAnimationFrame(animate);
        }
    }, [lastMove, isAnimatingMove, cellSize]);

    const getCellValue = (x: number, y: number): CellValue => {
        const key = `${x},${y}`;
        return cells[key] || null;
    };

    const handleCellClick = (x: number, y: number) => {
        if (!isDragging && !isAnimatingMove) {
            const value = getCellValue(x, y);
            if (!value && isYourTurn) {
                onCellClick(x, y);
            }
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isAnimatingMove) return;
        setIsDragging(true);
        setDragStart({
            x: e.clientX - viewportPosition.x,
            y: e.clientY - viewportPosition.y
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && !isAnimatingMove) {
            setViewportPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const getVisibleCells = () => {
        if (!containerRef.current) return [];

        const container = containerRef.current;
        const visibleCells = [];

        const startX = Math.floor((-viewportPosition.x) / cellSize) - 2;
        const startY = Math.floor((-viewportPosition.y) / cellSize) - 2;
        const cols = Math.ceil(container.clientWidth / cellSize) + 4;
        const rows = Math.ceil(container.clientHeight / cellSize) + 4;

        for (let y = startY; y < startY + rows; y++) {
            for (let x = startX; x < startX + cols; x++) {
                visibleCells.push({ x, y });
            }
        }

        return visibleCells;
    };

    const getServerIconState = (value: CellValue, isPreview: boolean = false): 'empty' | 'attacker' | 'defender' => {
        if (!value && !isPreview) return 'empty';
        if (isPreview) return playerSymbol === 'X' ? 'attacker' : 'defender';
        return value === 'X' ? 'attacker' : 'defender';
    };

    const renderCell = ({ x, y }: { x: number; y: number }) => {
        const value = getCellValue(x, y);
        const key = `${x},${y}`;
        const isHoverable = !value && isYourTurn;
        const isLastMove = lastMove && lastMove.x === x && lastMove.y === y;

        return (
            <div
                key={key}
                onClick={() => handleCellClick(x, y)}
                className={`absolute flex items-center justify-center w-[58px] h-[58px] border border-gray-700 bg-gray-800 
                    transition-all duration-200 ${isHoverable ? 'hover:bg-gray-700 cursor-pointer' : ''}
                    ${isLastMove ? 'ring-2 ring-yellow-500' : ''}`}
                style={{
                    left: x * cellSize,
                    top: y * cellSize,
                    transform: `translate(1px, 1px)`,
                }}
            >
                {value && (
                    <div className={`transform transition-transform duration-200 scale-100 
                        ${isLastMove ? 'animate-pulse' : ''}`}>
                        <ServerIcon state={getServerIconState(value)} />
                    </div>
                )}
                {isHoverable && !value && (
                    <div className="absolute opacity-20">
                        <ServerIcon state={getServerIconState(null, true)} />
                    </div>
                )}
            </div>
        );
    };

    const moveToLastMove = () => {
        if (lastMove && !isAnimatingMove) {
            setIsAnimatingMove(true);
        }
    };

    return (
        <div className="relative">
            <div 
                ref={containerRef}
                className={`relative w-screen h-screen bg-gray-900 overflow-hidden mx-auto 
                    ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={(e) => {
                    const touch = e.touches[0];
                    handleMouseDown({
                        clientX: touch.clientX,
                        clientY: touch.clientY
                    } as React.MouseEvent);
                }}
                onTouchMove={(e) => {
                    const touch = e.touches[0];
                    handleMouseMove({
                        clientX: touch.clientX,
                        clientY: touch.clientY
                    } as React.MouseEvent);
                }}
                onTouchEnd={handleMouseUp}
            >
                <div
                    style={{
                        transform: `translate(${viewportPosition.x}px, ${viewportPosition.y}px)`,
                    }}
                    className="absolute transition-transform duration-75"
                >
                    {getVisibleCells().map(renderCell)}
                </div>
            </div>
            
            <div className="fixed top-4 right-4 flex flex-col gap-2 z-50">
                {lastMove && (
                    <button
                        onClick={moveToLastMove}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                        disabled={isAnimatingMove}
                    >
                        Последний ход
                    </button>
                )}
                {turnTimeLeft !== undefined && (
                    <div className={`px-4 py-2 rounded ${
                        turnTimeLeft < 5000 ? 'bg-red-600' : 'bg-gray-700'
                    }`}>
                        Осталось: {Math.ceil(turnTimeLeft / 1000)}с
                    </div>
                )}
            </div>
        </div>
    );
};

export default GameBoard;
