const LOGGER = require('../utils/Logger');

export const Rules = {
    CommandBlockOutput: 'commandblockoutput',
    DoDayLightCycle: 'dodaylightcycle',
    DoEntityDrops: 'doentitydrops',
    DoFireTick: 'dofiretick',
    DoMobLoot: 'domobloot',
    DoMobSpawning: 'domobspawning',
    DoTileDrops: 'dotiledrops',
    DoWeatherCycle: 'doweathercycle',
    DrowingDamage: 'drowningdamage',
    FallDamage: 'falldamage',
    FireDamage: 'firedamage',
    KeepInventory: 'keepinventory',
    MobGriefing: 'mobgriefing',
    NaturalRegeneration: 'naturalregeneration',
    PVP: 'pvp',
    SendCommandFeedback: 'sendcommandfeedback',
    ShowCoordinates: 'showcoordinates',  // bool
    RandomTickSpeed: 'randomtickspeed',
    TNTExplodes: 'tntexplodes'
};

export class GameruleManager {
    private rules: Map<string, any> = new Map();

    /**
     * Sets a game rule.
     * 
     * @param name 
     * @param value 
     */
    public setGamerule(name: string, value: boolean | number): void {
        this.rules.set(name, value);
    }

    /**
     * Returns the game rule value by its name.
     * 
     * @param name 
     */
    public getGamerule(name: string): any {
        if (!Object.values(Rules).includes(name)) {
            LOGGER.error(`Unknown Gamerule with name ${name}`);
        }
        this.rules.get(name);
    }

    public getGamerules(): Map<string, any> {
        return this.rules;
    }

}
