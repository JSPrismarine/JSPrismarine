import DataPacket from './DataPacket';

/**
 * Tells the client which kind of actor hit the player last.
 *
 * Wire order at protocol 2193: `LastHurtBy` as a ZigZag varint32, and nothing else.
 *
 * The value is a member of Mojang's `ActorType`, an enum of around 160 members that this
 * repository does not generate, so the field is a plain number. Its values are not
 * consecutive: Mojang's datagen snapshot (`packages/minecraft/datagen/snapshot/enums.html`)
 * numbers `Undefined` as 1, `Player` as 319 and `Creeper` as 2849. The rendered 1.26.51 page
 * counts the members from 0, which is a display artifact, not the wire value. No client
 * behavior is known to depend on the packet.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-last-hurt-by-packet/
 */
export default class SetLastHurtByPacket extends DataPacket {
    /** The `ActorType` of the last attacker. */
    public lastHurtBy = 0;

    /** Reads the actor type. */
    public decodePayload(): void {
        this.lastHurtBy = this.readVarInt();
    }

    /** Writes the actor type. */
    public encodePayload(): void {
        this.writeVarInt(this.lastHurtBy);
    }
}
