// import BinaryStream from '@jsprismarine/jsbinaryutils';
import type Server from '../Server';
import { NetworkUtil } from '../network/NetworkUtil';

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

export default class GameRuleManager {
    private readonly server: Server;
    private readonly rules: Map<string, [boolean | number, boolean]> = new Map() as Map<
        string,
        [boolean | number, boolean]
    >;

    public constructor(server: Server) {
        this.server = server;

        // Set default values
        this.setGameRule('CommandBlockOutput', true, true);
        this.setGameRule('DoDayLightCycle', true, true);
        this.setGameRule('DoEntityDrops', true, true);
        this.setGameRule('DoFireTick', true, true);
        this.setGameRule('DoMobLoot', true, true);
        this.setGameRule('DoMobSpawning', true, true);
        this.setGameRule('DoTileDrops', true, true);
        this.setGameRule('DoWeatherCycle', true, true);
        this.setGameRule('DrowningDamage', true, true);
        this.setGameRule('FallDamage', true, true);
        this.setGameRule('FireDamage', true, true);
        this.setGameRule('KeepInventory', false, true);
        this.setGameRule('MobGriefing', true, true);
        this.setGameRule('NaturalRegeneration', true, true);
        this.setGameRule('PVP', true, true);
        this.setGameRule('ShowCoordinates', false, true);
        this.setGameRule('RandomTickSpeed', 3, true);
        this.setGameRule('TNTExplodes', true, true);
        this.setGameRule('sendCommandFeedback', true, true);
    }

    /**
     * Sets a game rule.
     * @param {string} name - the gameRule's name.
     * @param {boolean | number} value - the value, boolean OR number.
     * @param {boolean} editable - if the gameRule is editable.
     * @TODO: notify clients about gameRule change.
     */
    public setGameRule(name: string, value: boolean | number, editable: boolean): void {
        this.rules.set(name.toLowerCase(), [value, editable]);
    }

    /**
     * Returns the gameRule value.
     * @param {string} name - the gameRule's name.
     */
    public getGameRule(name: string) {
        if (!Object.values(GameRules).includes(name.toLowerCase())) {
            this.server.getLogger().error(`Unknown GameRule with name ${name}`);
        }

        return this.rules.get(name.toLowerCase()) ?? null;
    }

    public getGameRules() {
        return this.rules;
    }

    public networkSerialize(stream: any): void {
        const isInt = (n: number) => {
            return n % 1 === 0;
        };

        stream.writeUnsignedVarInt(this.getGameRules().size);
        for (const [name, [value, editable]] of this.getGameRules()) {
            NetworkUtil.writeString(stream, name.toLowerCase());
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
                    this.server.getLogger().error('GameRule format not implemented');
            }
        }
    }
}
