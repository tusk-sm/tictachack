import React from 'react';

interface ServerIconProps {
    state: 'empty' | 'attacker' | 'defender';
}

const ServerIcon: React.FC<ServerIconProps> = ({ state }) => {
    const color = state === 'empty' ? '#4B5563' : 
                 state === 'attacker' ? '#EF4444' : '#10B981';

    return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 9V15M19 15V19C19 20.1046 18.1046 21 17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H17C18.1046 3 19 3.89543 19 5V9M19 15H5M19 9H5M9 7H7M9 13H7M9 19H7" 
                stroke={color} 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
            />
            <circle cx="17" cy="7" r="1" fill={color} />
            <circle cx="17" cy="13" r="1" fill={color} />
            <circle cx="17" cy="19" r="1" fill={color} />
        </svg>
    );
};

export default ServerIcon;
