import AddActorPacket2225 from '../packet/AddActorPacket2225';
import AddPlayerPacket2225 from '../packet/AddPlayerPacket2225';
import AnimatePacket2225 from '../packet/AnimatePacket2225';
import InventoryTransactionPacket2225 from '../packet/InventoryTransactionPacket2225';
import LevelChunkPacket2225 from '../packet/LevelChunkPacket2225';
import PlayerListPacket2225 from '../packet/PlayerListPacket2225';
import PlayerSkinPacket2225 from '../packet/PlayerSkinPacket2225';
import StartGamePacket2225 from '../packet/StartGamePacket2225';
import { Codec2193 } from './Codec2193';
import type { PacketClass } from './Codec2193';
import { minecraftVersions, packetIds, protocolVersion } from './v2225';

/**
 * The codec for protocol 2225 (Minecraft 1.26.60): the first delta codec, carrying only what
 * moved since 2193. The id table is 2193's plus the eight packets 1.26.60 added, and
 * {@link packetOverrides} swaps in the packets whose wire layout changed; everything else is
 * inherited. docs/research/protocol-2225-delta.md records the full delta, what of it is
 * implemented here, and the sources each change was verified against.
 */
class Codec2225 extends Codec2193 {
    public override readonly protocolVersion = protocolVersion;
    public override readonly minecraftVersions = minecraftVersions;
    public override readonly ids = packetIds;

    public override netIdOf(name: string): number | undefined {
        return this.ids[name];
    }

    protected override packetOverrides(): Readonly<Record<string, PacketClass>> {
        return {
            AddActorPacket: AddActorPacket2225,
            AddPlayerPacket: AddPlayerPacket2225,
            AnimatePacket: AnimatePacket2225,
            InventoryTransactionPacket: InventoryTransactionPacket2225,
            LevelChunkPacket: LevelChunkPacket2225,
            PlayerListPacket: PlayerListPacket2225,
            PlayerSkinPacket: PlayerSkinPacket2225,
            StartGamePacket: StartGamePacket2225
        };
    }
}

export default new Codec2225();
