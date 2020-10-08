
const Gamemode = {

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
    }
    
};
module.exports = Gamemode;
