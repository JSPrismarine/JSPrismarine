// import BinaryStream from '@jsprismarine/jsbinaryutils';
import McpeUtil from '../network/NetworkUtil';
import type Server from '../Server';

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
    ShowCoordinates: 'showcoordinates', // Bool
    RandomTickSpeed: 'randomtickspeed',
    TNTExplodes: 'tntexplodes',
    sendCommandFeedback: 'sendcommandfeedback'
};

export default class GameruleManager {
    private readonly server: Server;
    private readonly rules: Map<string, [boolean | number, boolean]> = new Map() as Map<
        string,
        [boolean | number, boolean]
    >;

    public constructor(server: Server) {
        this.server = server;

        // Set default values
        this.setGamerule('CommandBlockOutput', true, true);
        this.setGamerule('DoDayLightCycle', true, true);
        this.setGamerule('DoEntityDrops', true, true);
        this.setGamerule('DoFireTick', true, true);
        this.setGamerule('DoMobLoot', true, true);
        this.setGamerule('DoMobSpawning', true, true);
        this.setGamerule('DoTileDrops', true, true);
        this.setGamerule('DoWeatherCycle', true, true);
        this.setGamerule('DrowningDamage', true, true);
        this.setGamerule('FallDamage', true, true);
        this.setGamerule('FireDamage', true, true);
        this.setGamerule('KeepInventory', false, true);
        this.setGamerule('MobGriefing', true, true);
        this.setGamerule('NaturalRegeneration', true, true);
        this.setGamerule('PVP', true, true);
        this.setGamerule('ShowCoordinates', false, true);
        this.setGamerule('RandomTickSpeed', 3, true);
        this.setGamerule('TNTExplodes', true, true);
        this.setGamerule('sendCommandFeedback', true, true);
    }

    /**
     * Sets a game rule.
     *
     * @param name - the gamerule's name
     * @param value - the value, boolean OR number
     */
    public setGamerule(name: string, value: boolean | number, editable: boolean): void {
        this.rules.set(name.toLowerCase(), [value, editable]);
    }

    /**
     * Returns the gamerule value.
     *
     * @param name - the gamerule's name
     */
    public getGamerule(name: string): any {
        if (!Object.values(GameRules).includes(name.toLowerCase())) {
            this.server.getLogger()?.error(`Unknown Gamerule with name ${name}`, 'GameruleManager/getGamerule');
        }

        return this.rules.get(name.toLowerCase());
    }

    public getGamerules() {
        return this.rules;
    }

    public networkSerialize(stream: any): void {
        const isInt = (n: number) => {
            return n % 1 === 0;
        };

        stream.writeUnsignedVarInt(this.getGamerules().size);
        for (const [name, [value, editable]] of this.getGamerules()) {
            McpeUtil.writeString(stream, name.toLowerCase());
            stream.writeBoolean(editable);
            switch (typeof value) {
                case 'boolean':
                    stream.writeByte(1); // Maybe value type ??
                    stream.writeBoolean(value);
                    break;
                case 'number':
                    if (isInt(value)) {
                        stream.writeByte(2); // Maybe value type ??
                        stream.writeUnsignedVarInt(value);
                    } else {
                        stream.writeByte(3); // Maybe value type ??
                        stream.writeFloatLE(value);
                    }
                    break;
                default:
                    this.server
                        .getLogger()
                        ?.error('Gamerule format not implemented', 'GameruleManager/networkSerialize');
            }
        }
    }
}
