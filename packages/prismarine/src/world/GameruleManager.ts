import PacketBinaryStream from '../network/PacketBinaryStream';
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
    TNTExplodes: 'tntexplodes',
    sendCommandFeedback: 'sendcommandfeedback'
};

export default class GameruleManager {
    private readonly server: Server;
    private readonly rules: Map<string, boolean | number> = new Map();

    public constructor(server: Server) {
        this.server = server;

        // Set default values
        this.setGamerule('CommandBlockOutput', true);
        this.setGamerule('DoDayLightCycle', true);
        this.setGamerule('DoEntityDrops', true);
        this.setGamerule('DoFireTick', true);
        this.setGamerule('DoMobLoot', true);
        this.setGamerule('DoMobSpawning', true);
        this.setGamerule('DoTileDrops', true);
        this.setGamerule('DoWeatherCycle', true);
        this.setGamerule('DrowingDamage', true);
        this.setGamerule('FallDamage', true);
        this.setGamerule('FireDamage', true);
        this.setGamerule('KeepInventory', false);
        this.setGamerule('MobGriefing', true);
        this.setGamerule('NaturalRegeneration', true);
        this.setGamerule('PVP', true);
        this.setGamerule('SendCommandFeedback', true);
        this.setGamerule('ShowCoordinates', false);
        this.setGamerule('RandomTickSpeed', 3);
        this.setGamerule('TNTExplodes', true);
        this.setGamerule('sendCommandFeedback', true);
    }

    /**
     * Sets a game rule.
     *
     * @param name the gamerule's name
     * @param value the value, boolean OR number
     */
    public setGamerule(name: string, value: boolean | number): void {
        this.rules.set(name.toLowerCase(), value);
    }

    /**
     * Returns the gamerule value.
     *
     * @param name the gamerule's name
     */
    public getGamerule(name: string): any {
        if (!Object.values(GameRules).includes(name.toLowerCase())) {
            this.server.getLogger()?.error(`Unknown Gamerule with name ${name}`, 'GameruleManager/getGamerule');
        }

        this.rules.get(name.toLowerCase());
    }

    public getGamerules() {
        return this.rules;
    }

    public networkSerialize(stream: PacketBinaryStream): void {
        const isInt = (n: number) => {
            return n % 1 === 0;
        };

        stream.writeUnsignedVarInt(this.getGamerules().size);
        for (const [name, value] of this.getGamerules()) {
            stream.writeString(name.toLowerCase());
            switch (typeof value) {
                case 'boolean':
                    stream.writeByte(1); // Maybe value type ??
                    stream.writeBool(value);
                    break;
                case 'number':
                    if (isInt(value)) {
                        stream.writeByte(2); // Maybe value type ??
                        stream.writeUnsignedVarInt(value);
                    } else {
                        stream.writeByte(3); // Maybe value type ??
                        stream.writeLFloat(value);
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
