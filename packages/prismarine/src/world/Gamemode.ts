export const Gamemode = {
    Survival: 0,
    Creative: 1,
    Adventure: 2,
    Spectator: 3,
    Default: 5,

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
    getGamemodeId: (mode: string) => {
        switch (`${mode}`.toLowerCase()) {
            case 'survival':
            case '0':
                return Gamemode.Survival;
            case 'creative':
            case '1':
                return Gamemode.Creative;
            case 'adventure':
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
