export type CellValue = null | 'X' | 'O';
export type PlayerSymbol = 'X' | 'O';

export interface Cell {
    x: number;
    y: number;
    value: CellValue;
}

export interface Player {
    id: string;
    socketId: string;
    telegramId?: number;
    nickname: string;    
    username?: string;
    avatarUrl?: string;
    isAttacker: boolean;
    score: number;
}

export interface GameRoom {
    id: string;
    players: {
        X?: Player;
        O?: Player;
    };
    currentPlayer: PlayerSymbol;
    cells: { [key: string]: CellValue };
    winner: CellValue;
    status: 'waiting' | 'playing' | 'finished';
}

export interface GameState {
    room?: GameRoom;
    currentPlayer: 'X' | 'O';
    cells: { [key: string]: CellValue };
    winner: CellValue;
    isYourTurn: boolean;
    playerSymbol?: 'X' | 'O';
    status: 'waiting' | 'playing' | 'finished';
    players: {
        attacker?: Player;
        defender?: Player;
    };
    lastMove?: {
        x: number;
        y: number;
        player: 'X' | 'O';
    };
    turnStartTime?: number | undefined | null;
    turnTimeLimit: number; // в миллисекундах
    readyForNewGame?: {
        [playerId: string]: boolean;
    };
    createdAt?: number;
    finishedAt?: number;
    historySaved?: boolean;
    roomChatId?: string;
}

export interface GameMove {
    x: number;
    y: number;
    player: 'X' | 'O';
    roomId: string;
}
