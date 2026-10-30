import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';
import FieldNetworkPacket from '../FieldNetworkPacket';

/** Most bytes an actor flag bit set needs: seven flag bits per byte, `ActorFlags.COUNT` flags. */
const MAX_FLAG_BYTES = Math.ceil(ActorFlags.COUNT / 7);

/**
 * The client's view of the movement inputs it predicts with, sent after it has applied a
 * server correction under server-authoritative movement.
 *
 * Wire layout at protocol 2193: Actor Data Flag as a bit set written seven bits per byte with
 * a continuation bit, like a LEB128 varint of unbounded width; Actor Bounding Box as three
 * float LE (scale, width, height); Movement Attributes as nine float LE (movement speed,
 * underwater speed, lava speed, jump strength, health, hunger, friction modifier, bounciness,
 * air drag modifier); Actor Unique ID as a ZigZag varint64; Actor Flying State as a boolean.
 * Mojang's page leaves `MovementAttributesComponent` empty; the nine floats are what
 * gophertunnel reads at 2193.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/client-movement-prediction-sync-packet/
 */
export default class ClientMovementPredictionSyncPacket extends FieldNetworkPacket {
    /** Actor flag bits, bit `n` set when `ActorFlags` member `n` is on. */
    public actorFlags = 0n;

    public boundingBoxScale = 0;
    public boundingBoxWidth = 0;
    public boundingBoxHeight = 0;
    public movementSpeed = 0;
    public underwaterMovementSpeed = 0;
    public lavaMovementSpeed = 0;
    public jumpStrength = 0;
    public health = 0;
    public hunger = 0;
    public frictionModifier = 0;
    public bounciness = 0;
    public airDragModifier = 0;

    /** Unique id of the actor the client is predicting, normally its own player. */
    public actorUniqueId = 0n;

    public actorFlyingState = false;

    /** Reads the flag bit set, the twelve floats, the unique id, and the flying flag. */
    public decodePayload(): void {
        this.actorFlags = this.readFlagBits();
        this.boundingBoxScale = this.readFloatLE();
        this.boundingBoxWidth = this.readFloatLE();
        this.boundingBoxHeight = this.readFloatLE();
        this.movementSpeed = this.readFloatLE();
        this.underwaterMovementSpeed = this.readFloatLE();
        this.lavaMovementSpeed = this.readFloatLE();
        this.jumpStrength = this.readFloatLE();
        this.health = this.readFloatLE();
        this.hunger = this.readFloatLE();
        this.frictionModifier = this.readFloatLE();
        this.bounciness = this.readFloatLE();
        this.airDragModifier = this.readFloatLE();
        this.actorUniqueId = this.readVarLong();
        this.actorFlyingState = this.readBoolean();
    }

    /** Writes the fields in the same order. */
    public encodePayload(): void {
        this.writeFlagBits(this.actorFlags);
        this.writeFloatLE(this.boundingBoxScale);
        this.writeFloatLE(this.boundingBoxWidth);
        this.writeFloatLE(this.boundingBoxHeight);
        this.writeFloatLE(this.movementSpeed);
        this.writeFloatLE(this.underwaterMovementSpeed);
        this.writeFloatLE(this.lavaMovementSpeed);
        this.writeFloatLE(this.jumpStrength);
        this.writeFloatLE(this.health);
        this.writeFloatLE(this.hunger);
        this.writeFloatLE(this.frictionModifier);
        this.writeFloatLE(this.bounciness);
        this.writeFloatLE(this.airDragModifier);
        this.writeVarLong(this.actorUniqueId);
        this.writeBoolean(this.actorFlyingState);
    }

    /**
     * Reads the actor flag bit set.
     *
     * Each byte carries seven flag bits, low bits first, and a high continuation bit. The
     * loop stops at the first byte without the continuation bit or throws once more bytes
     * arrive than `ActorFlags.COUNT` flags can need.
     */
    private readFlagBits(): bigint {
        let bits = 0n;
        for (let index = 0; index < MAX_FLAG_BYTES; index++) {
            const byte = this.readByte();
            bits |= BigInt(byte & 0x7f) << BigInt(index * 7);
            if ((byte & 0x80) === 0) return bits;
        }

        throw new Error(`Actor flag bit set runs past ${MAX_FLAG_BYTES} bytes`);
    }

    private writeFlagBits(bits: bigint): void {
        let rest = bits;
        do {
            const group = Number(rest & 0x7fn);
            rest >>= 7n;
            this.writeByte(rest > 0n ? group | 0x80 : group);
        } while (rest > 0n);
    }
}
