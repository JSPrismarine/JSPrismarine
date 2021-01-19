import Server from '../Server';

export const GameRules = {
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
    ShowCoordinates: 'showcoordinates', // Bool
    RandomTickSpeed: 'randomtickspeed',
    TNTExplodes: 'tntexplodes'
};

export default class GameruleManager {
    private readonly server: Server;
    private readonly rules: Map<string, any> = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

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
        if (!Object.values(GameRules).includes(name)) {
            this.server
                .getLogger()
                .error(
                    `Unknown Gamerule with name ${name}`,
                    'GameruleManager/getGamerule'
                );
        }

        this.rules.get(name);
    }

    public getGamerules(): Map<string, any> {
        return this.rules;
    }
}
