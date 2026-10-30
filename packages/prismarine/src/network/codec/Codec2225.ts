import StartGamePacket2225 from '../packet/StartGamePacket2225';
import { Codec2193 } from './Codec2193';
import type { PacketClass } from './Codec2193';
import { itemData2225 } from './itemData';
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
    public override readonly itemData = itemData2225;

    public override netIdOf(name: string): number | undefined {
        return this.ids[name];
    }

    protected override packetOverrides(): Readonly<Record<string, PacketClass>> {
        return {
            StartGamePacket: StartGamePacket2225
        };
    }
}

export default new Codec2225();
