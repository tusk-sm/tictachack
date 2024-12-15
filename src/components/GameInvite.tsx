import React from 'react';

interface GameInviteProps {
    roomId: string;
}

const GameInvite: React.FC<GameInviteProps> = ({ roomId }) => {
    const gameUrl = typeof window !== 'undefined' ? `${window.location.origin}?room=${roomId}` : '';

    const shareText = `Присоединяйся ко мне в игре!`;
    
    const shareLinks = {
        telegram: `https://t.me/share/url?url=${encodeURIComponent(gameUrl)}&text=${encodeURIComponent(shareText)}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + gameUrl)}`,
        vk: `https://vk.com/share.php?url=${encodeURIComponent(gameUrl)}&title=${encodeURIComponent(shareText)}`
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(gameUrl);
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-gray-800 p-8 rounded-lg shadow-xl text-center max-w-lg w-full mx-4">
                <h2 className="text-2xl font-bold mb-4">Ваша комната создана!</h2>
                <div className="bg-gray-700 p-4 rounded mb-4 break-all">
                    <p className="text-sm font-mono select-all">{gameUrl}</p>
                </div>
                <button
                    onClick={copyToClipboard}
                    className="mb-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors w-full"
                >
                    Копировать ссылку
                </button>
                <div className="flex justify-center space-x-4">
                    <a
                        href={shareLinks.telegram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-blue-500 hover:bg-blue-600 rounded transition-colors flex-1"
                    >
                        Telegram
                    </a>
                    <a
                        href={shareLinks.whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-green-500 hover:bg-green-600 rounded transition-colors flex-1"
                    >
                        WhatsApp
                    </a>
                    <a
                        href={shareLinks.vk}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors flex-1"
                    >
                        VK
                    </a>
                </div>
            </div>
        </div>
    );
};

export default GameInvite;
