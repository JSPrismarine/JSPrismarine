const Gamemode = {
    Unknown: -1,
    Survival: 0,
    Creative: 1,
    Adventure: 2,
    Spectator: 3,

    getGamemodeName: (mode) => {
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
                return 'Unknown';
        }
    },
    getGamemodeId: (mode) => {
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
                return Gamemode.Unknown;
        }
    }
};
export default Gamemode;