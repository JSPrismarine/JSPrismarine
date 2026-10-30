import { layoutAt, mobEffectPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * What a {@link MobEffectPacket} does to the effect it names, as the Event ID byte numbers it.
 */
export enum MobEffectEvent {
    Invalid = 0,
    Add = 1,
    Update = 2,
    Remove = 3
}

/**
 * Adds, updates, or removes one status effect on an actor.
 *
 * **Bound To:** Client
 *
 * A joining player's saved effects arrive this way, and so does every later change. The
 * effects that change movement - levitation, slow falling, jump boost, speed, slowness and
 * weaving - have to reach the client for a player and for any vehicle it predicts, or the
 * client simulates movement the server will then correct.
 *
 * Protocol 2193 layout (docs id 28), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Runtime ID | varuint64 | |
 * | Event ID | uint8 | One of {@link MobEffectEvent} |
 * | Effect ID | varint32 | |
 * | Effect Amplifier | varint32 | One below the level shown in game, and may be negative |
 * | Show Particles | boolean | |
 * | Effect Duration Ticks | varint32 | Negative never expires |
 * | Tick | varuint64 | PlayerInputTick; zero when the target is not the client's own player |
 * | Ambient | boolean | Set for beacon and conduit effects |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/mob-effect-packet/
 */
export default class MobEffectPacket extends FieldNetworkPacket {
    /** Target Runtime ID, the actor the effect is on. */
    public targetRuntimeId = 0n;

    /** Event ID, what to do with the effect. */
    public eventId: MobEffectEvent = MobEffectEvent.Add;

    /** Effect ID, the status effect's number. */
    public effectId = 0;

    /** Effect Amplifier, one below the level the client shows. */
    public effectAmplifier = 0;

    /** Show Particles, whether viewers see particles around the actor. */
    public showParticles = true;

    /** Effect Duration Ticks, at 20 ticks per second. A negative duration never expires. */
    public effectDurationTicks = 0;

    /**
     * Tick, the most recently processed `PlayerAuthInputPacket` tick when the effect belongs
     * to the receiving player or a vehicle it controls. Zero otherwise.
     */
    public tick = 0n;

    /** Ambient, whether the effect came from a beacon or a conduit. */
    public ambient = false;

    /** Reads the target, the event, and the effect's parameters. */
    public decodePayload(): void {
        const read = layoutAt(mobEffectPacket, this.codecProtocol).decode(this);
        this.targetRuntimeId = read.targetRuntimeId;
        this.eventId = read.eventId;
        this.effectId = read.effectId;
        this.effectAmplifier = read.effectAmplifier;
        this.showParticles = read.showParticles;
        this.effectDurationTicks = read.effectDurationTicks;
        this.tick = read.tick;
        this.ambient = read.ambient;
    }

    /** Writes the target, the event, and the effect's parameters. */
    public encodePayload(): void {
        layoutAt(mobEffectPacket, this.codecProtocol).encode(this, {
            targetRuntimeId: this.targetRuntimeId,
            eventId: this.eventId,
            effectId: this.effectId,
            effectAmplifier: this.effectAmplifier,
            showParticles: this.showParticles,
            effectDurationTicks: this.effectDurationTicks,
            tick: this.tick,
            ambient: this.ambient
        });
    }
}
