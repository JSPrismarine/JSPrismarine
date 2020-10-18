const Gamemode = {
    Unknown: -1,
    Survival: 0,
    Creative: 1,

    getGamemodeName: (mode) => {
        switch (mode) {
            case Gamemode.Survival:
                return 'Survival';
            case Gamemode.Creative:
                return 'Creative';
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
            default:
                return Gamemode.Unknown;
        }
    }
};
export default Gamemode;