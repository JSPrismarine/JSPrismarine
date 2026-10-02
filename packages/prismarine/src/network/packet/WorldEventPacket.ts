import type { Vector3 } from '@jsprismarine/math';
import type { LevelEvent } from '@jsprismarine/minecraft';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * A world event: the client is told *what* happened and where, and picks the sound and the
 * particles itself.
 *
 * The ids live in `@jsprismarine/minecraft` as {@link LevelEvent} rather than here. This
 * packet used to carry a second copy of the list written as a bare enum, so every id
 * numbered from zero while vanilla's are grouped in ranges - 1000 for sounds, 2000 for
 * particles, 3600 for block cracking. Breaking a block sent event 36 where the client
 * expects 2001, and since 2001 is what makes it play the break sound and spawn the destroy
 * particles, both went missing.
 */
export default class WorldEventPacket extends DataPacket {
    public static NetID = Identifiers.WorldEventPacket;

    public eventId!: LevelEvent;
    public position!: Vector3 | null;
    public data!: number;

    public decodePayload(): void {
        this.eventId = this.readVarInt();
        this.position = NetworkUtil.readVector3(this);
        this.data = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeVarInt(this.eventId);
        NetworkUtil.writeVector3(this, this.position);
        this.writeVarInt(this.data);
    }
}
