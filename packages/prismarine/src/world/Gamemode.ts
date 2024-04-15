export const Gamemode = {
    Survival: 0,
    Creative: 1,
    Adventure: 2,
    Spectator: 3,
    Default: 5,

    /**
     * Get the gamemode string from a gamemode ID.
     * @param {number} mode - The gamemode ID to convert to a gamemode string.
     * @returns {string} - The gamemode string.
     */
    getGamemodeName: (mode: number) => {
        switch (mode) {
            case Gamemode.Survival:
                return 'Survival';
            case Gamemode.Creative:
                return 'Creative';
            case Gamemode.Adventure:
                return 'Adventure';
            case Gamemode.Spectator:
                return 'Spectator';
            default:
                throw new Error('Unknown gamemode');
        }
    },

    /**
     * Get the gamemode ID from a gamemode string.
     * @param {string} mode - The gamemode string to convert to a gamemode ID.
     * @returns {number} - The gamemode ID.
     */
    getGamemodeId: (mode: string) => {
        switch (`${mode}`.toLowerCase()) {
            case 'survival':
            case 's':
            case '0':
                return Gamemode.Survival;
            case 'creative':
            case 'c':
            case '1':
                return Gamemode.Creative;
            case 'adventure':
            case 'a':
            case '2':
                return Gamemode.Adventure;
            case 'spectator':
            case '3':
                return Gamemode.Spectator;
            default:
                throw new Error('Unknown gamemode');
        }
    }
};
