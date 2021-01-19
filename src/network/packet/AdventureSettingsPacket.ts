import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export enum AdventureSettingsFlags {
    WorldImmutable = 0x01,
    NoPvp = 0x02,
    AutoJump = 0x20,
    AllowFlight = 0x40,
    NoClip = 0x80,
    WorldBuilder = 0x100,
    Flying = 0x200,
    Muted = 0x400,

    // See: https://github.com/pmmp/PocketMine-MP/blob/15401d740f11f3a543abaecc7a449bcba3c2fc91/src/pocketmine/network/mcpe/protocol/AdventureSettingsPacket.php#L40-L44
    BuildAndMine = 0x01 | (1 << 16),
    DoorsAndSwitches = 0x02 | (1 << 16),
    OpenContainers = 0x04 | (1 << 16),
    AttackPlayers = 0x08 | (1 << 16),
    AttachMobs = 0x10 | (1 << 16),
    Operator = 0x20 | (1 << 16),
    Teleport = 0x80 | (1 << 16)
}

export default class AdventureSettingsPacket extends DataPacket {
    public static NetID = Identifiers.AdventureSettingsPacket;

    public flags!: number;
    public commandPermission!: number;
    public flags2!: number;
    public playerPermission!: number;
    public customFlags!: number;
    public entityId!: bigint;

    public encodePayload() {
        this.writeUnsignedVarInt(this.flags);
        this.writeUnsignedVarInt(this.commandPermission);
        this.writeUnsignedVarInt(this.flags2);
        this.writeUnsignedVarInt(this.playerPermission);
        this.writeUnsignedVarInt(this.customFlags);
        this.writeLLong(this.entityId);
    }

    public decodePayload() {
        this.flags = this.readUnsignedVarInt();
        this.commandPermission = this.readUnsignedVarInt();
        this.flags2 = this.readUnsignedVarInt();
        this.playerPermission = this.readUnsignedVarInt();
        this.customFlags = this.readUnsignedVarInt();
        this.entityId = this.readLLong();
    }

    public getFlag(flag: AdventureSettingsFlags) {
        if ((flag & (1 << 16)) !== 0) return (this.flags2 & flag) !== 0;
        return (this.flags & flag) !== 0;
    }

    public setFlag(flag: AdventureSettingsFlags, value: boolean) {
        if ((flag & (1 << 16)) !== 0) {
            if (value) this.flags2 |= flag;
            else this.flags2 &= ~flag;
        } else {
            if (value) this.flags |= flag;
            else this.flags &= ~flag;
        }
    }
}
