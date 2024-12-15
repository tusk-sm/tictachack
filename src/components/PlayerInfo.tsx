import React from 'react';

interface PlayerInfoProps {
    nickname: string;
    isCurrentTurn: boolean;
    isAttacker: boolean;
    position: 'top' | 'bottom';
}

const PlayerInfo: React.FC<PlayerInfoProps> = ({ nickname, isCurrentTurn, isAttacker, position }) => {
    return (
        <div className={`fixed ${position === 'top' ? 'top-4' : 'bottom-4'} left-4 flex items-center gap-4 bg-gray-800 rounded-lg p-4 text-white`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isCurrentTurn ? (isAttacker ? 'bg-red-500' : 'bg-green-500') : 'bg-gray-600'
            }`}>
                {nickname.charAt(0).toUpperCase()}
            </div>
            <div>
                <div className="font-medium">{nickname}</div>
                <div className={`text-sm ${isCurrentTurn ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {isCurrentTurn ? 'Your turn' : 'Waiting...'}
                </div>
            </div>
        </div>
    );
};

export default PlayerInfo;
