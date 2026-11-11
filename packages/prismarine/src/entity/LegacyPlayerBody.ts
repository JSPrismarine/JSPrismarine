/**
 * The entity a legacy player stands in a world as.
 *
 * A {@link Player} is not an entity: it holds this body, and the world's entity map, the entity
 * index and the replicator hold the body in its place. Code that hands a player to entity code,
 * such as a blow's attacker, the portal touch, the entity events and the advancement triggers,
 * hands the body, and code that needs the player back finds it by entity id through
 * `World.viewerOf`. The body keeps the entity state, the inventory and the player's component
 * fields, and its overrides are the player's rules as an entity: what reaches it, how a shove
 * reaches it, how its portal clock runs and how it is shown. The rest of a player's tick and its
 * death are the player's, which the body calls.
 *
 * It answers what the network layer reads of a player as `StorePlayerActor` does, the actor of a
 * player in the entity store, with the same `player` back-reference. Step H-B2 of the entity and
 * tick re-architecture replaces this class with that actor.
 * @internal
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { Gametype } from '@jsprismarine/minecraft';
import type UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';

import type Player from '../Player';
import type PlayerSession from '../network/PlayerSession';
import type Device from '../utils/Device';
import type { PlainData } from '../world/changelog/PlainData';
import type { PortalRule } from '../world/portal/rules';
import { PLAYER_TRACKING_RANGE_CHUNKS } from '../world/ShownPlayer';
import type { ShownPlayer } from '../world/ShownPlayer';
import { DamageSource } from './DamageSource';
import { DamageCause } from './Entity';
import type { EntityPositionOptions } from './Entity';
import Human from './Human';
import { logLegacyWrite } from './legacyAdapter';
import { PlayerComponents } from './playerComponents';
import { PORTAL_COOLDOWN_TICKS, PORTAL_TRANSITION_TICKS } from './PortalContact';
import type { StatusEffect } from './StatusEffect';
import type { SurvivalPlayer } from './survivalPlayer';
import { applyHungerEffect } from './playerHunger';

/**
 * How far a blow lifts a player off the ground.
 *
 * A flat number, where a mob's is applied on top of whatever the mob was already doing - see
 * `StoreActor.applyKnockback` in `entity/data/storeActors.ts`, which damps the mob's own
 * velocity first. The server does not track a player's vertical velocity at all, since their
 * position arrives already integrated by their own client, so there is nothing here to damp.
 * Vanilla's value, which is what a mob gets from a standing start.
 */
const KNOCKBACK_LIFT = 0.4;

/** The body of one legacy {@link Player} in a world. */
export class LegacyPlayerBody extends Human implements ShownPlayer {
    /**
     * Vitals, experience, abilities, movement flags, the spawn point and an item use in progress,
     * each written through a setter the change log hears.
     */
    private readonly components = new PlayerComponents(
        this.attributes,
        (field, before, after) => logLegacyWrite(this, field, before, after),
        this.metadata
    );

    /**
     * @param player - The player this body is the entity of.
     * @param options - What {@link Human} takes.
     */
    public constructor(
        public readonly player: Player,
        options: ConstructorParameters<typeof Human>[0]
    ) {
        super(options);
    }

    /** The player's logged component state, which the player and the survival rules read and write. */
    public getComponents(): PlayerComponents {
        return this.components;
    }

    /**
     * The player as the survival rules read it, which the store's player systems also run. Built
     * on first use.
     */
    public getSurvival(): SurvivalPlayer {
        this.survival ??= {
            components: this.components,
            vulnerable: () => this.player.isVulnerable(),
            alive: () => this.isAlive(),
            health: () => this.getHealth(),
            maxHealth: () => this.getMaxHealth()
        };
        return this.survival;
    }
    private survival: SurvivalPlayer | undefined;

    /** The entity's part of the tick, then the player's; see {@link Player.updatePlayer}. */
    public override async update(tick: number): Promise<void> {
        await super.update(tick);
        await this.player.updatePlayer(tick);
    }

    /** The player's death, which runs the entity's at the point the player says; see {@link Player.die}. */
    protected override async onDeath(source: DamageSource): Promise<void> {
        await this.player.die(source, async () => super.onDeath(source));
    }

    /**
     * Hurt the player - unless the world cannot touch them.
     *
     * The gamemode check belongs here rather than only at each call site: a creative player
     * is unharmed by everything, not just by the two things that happen to call this today.
     * @param {number} amount - Half-hearts of damage.
     * @param {DamageCause | DamageSource} [source=DamageCause.Generic] - What did it, and who.
     * @returns {Promise<boolean>} `true` if any damage was actually taken.
     */
    public override async damage(
        amount: number,
        source: DamageCause | DamageSource = DamageCause.Generic
    ): Promise<boolean> {
        const damageSource = DamageSource.of(source);
        if (!this.player.isVulnerable() && !this.isReachedEvenWhenInvulnerable(damageSource)) return false;

        return super.damage(amount, damageSource);
    }

    /**
     * Whether a blow gets through to a player the world otherwise cannot hurt.
     *
     * Java's `#bypasses_invulnerability` tag, which is the void and `/kill`: a creative player
     * falls out of the world like anyone else. A spectator is beyond even those, as Java's
     * `isInvulnerableTo` answers before the tag is consulted.
     */
    private isReachedEvenWhenInvulnerable(source: DamageSource): boolean {
        return source.bypassesInvulnerability() && this.gamemode !== Gametype.SPECTATOR;
    }

    /**
     * Asks the client to shove the player, rather than shoving them.
     *
     * The one entity the server cannot simply move. A player's position comes from their own
     * client and is stored here as reported, so writing to it is overruled by the next movement
     * packet and shows up as rubber-banding. A velocity is a request the client honors, and it
     * runs the shove through the same physics as everything else the player does.
     *
     * Not awaited: knockback is a consequence of a hit, not a step of it, and the damage
     * pipeline has no reason to wait for a packet to be framed before taking the health off.
     * @param {number} directionX - Unit vector away from the blow, x.
     * @param {number} directionZ - Unit vector away from the blow, z.
     * @param {number} strength - How hard, with knockback resistance already taken off.
     */
    public override applyKnockback(directionX: number, directionZ: number, strength: number, _damping = 0.5): void {
        this.applyImpulse({ x: directionX * strength, y: KNOCKBACK_LIFT, z: directionZ * strength });
    }

    /** Asks the client to apply a world-space impulse; see {@link Player.applyImpulse}. */
    public override applyImpulse(impulse: EntityPosition): void {
        this.player.applyImpulse(impulse);
    }

    /** Hunger drains food faster and saturation fills it; the rest are the entity's. */
    protected override async applyStatusEffectTick(effect: StatusEffect, clock: number): Promise<void> {
        await super.applyStatusEffectTick(effect, clock);
        applyHungerEffect(this.getSurvival(), effect.id, effect.amplifier);
    }

    /** Sets an attribute, through the component field it is kept in when it has one, so the write is logged. */
    public override setAttributeValue(name: string, value: number): boolean {
        const before = this.attributes.getValue(name);
        if (!this.components.setAttribute(name, value)) return super.setAttributeValue(name, value);
        return this.attributes.getValue(name) !== before;
    }

    /** Writes a logged component field back; any other field is a human's. */
    public override restoreLoggedField(field: string, value: PlainData): boolean {
        return this.components.restore(field, value) || super.restoreLoggedField(field, value);
    }

    /**
     * Ticks this player has to stand in a portal before going through.
     *
     * Vanilla reads `players_nether_portal_creative_delay` (0) for a creative player and
     * `players_nether_portal_default_delay` (80) for everyone else; the game rules are not
     * modeled yet, so the portal rule's defaults are the answer. An end portal's rule says 0
     * for both.
     * @param rule - The rule of the portal stood in. Without one, a nether portal is assumed.
     * @returns 0 in creative, otherwise the rule's survival delay, 80 for a nether portal.
     */
    public override getPortalTransitionTicks(rule?: PortalRule): number {
        const creative = this.gamemode === Gametype.CREATIVE;
        if (rule !== undefined) return creative ? rule.delayTicks.creative : rule.delayTicks.survival;
        return creative ? PORTAL_TRANSITION_TICKS.creative : PORTAL_TRANSITION_TICKS.player;
    }

    /**
     * How long this player refuses portals after a dimension change.
     *
     * Half a second, where a mob waits fifteen: `Player.getDimensionChangingDelay` in vanilla.
     * @returns 10 ticks.
     */
    public override getDefaultPortalCooldown(): number {
        return PORTAL_COOLDOWN_TICKS.player;
    }

    /**
     * Counts the portal cooldown down by one tick, unless the client is still loading into the
     * last dimension change.
     *
     * `ServerPlayer.processPortalCooldown` holds the count while `isChangingDimension`, so the
     * ten ticks only start once the loading screen has closed; a player who arrives inside the
     * destination portal then has them wound back every tick they stay in it.
     */
    protected override processPortalCooldown(): void {
        if (this.player.getNetworkSession().pendingDimensionChange() !== undefined) return;
        super.processPortalCooldown();
    }

    /**
     * Players are followed as far as the viewer can see.
     * @returns {number} The tracking radius in chunks, {@link PLAYER_TRACKING_RANGE_CHUNKS}.
     */
    public override getTrackingRange(): number {
        return PLAYER_TRACKING_RANGE_CHUNKS;
    }

    /**
     * Players move constantly and are the entity everyone is looking at.
     * @returns {number} The interval in ticks.
     */
    public override getTrackingInterval(): number {
        return 2;
    }

    protected override broadcastsOwnMovement(): boolean {
        return true;
    }

    /**
     * A player appears to other clients as a player, not as a generic actor.
     * @param {PlayerSession} session - The client to show it to.
     */
    public override async spawnTo(session: PlayerSession): Promise<void> {
        await session.sendAddPlayer(this);
    }

    /** A move of the body, which for a player is always a teleport; see {@link Player.setPosition}. */
    public override async setPosition(options: EntityPositionOptions): Promise<void> {
        await this.player.setPosition(options);
    }

    /**
     * Moves the body as the entity it is, which {@link Player.setPlayerPosition} calls once it
     * has decided the movement mode.
     * @param options - The position and rotation, and whether observers snap to it.
     */
    public async moveBody(options: EntityPositionOptions): Promise<void> {
        await super.setPosition(options);
    }

    /** Whether the client last reported the player on the ground. */
    public override isOnGround(): boolean {
        return this.player.isOnGround();
    }

    /** The name the login carried. */
    public override getName(): string {
        return this.player.getName();
    }

    /** The name as chat and command output show a player. */
    public override getFormattedUsername(): string {
        return this.player.getFormattedUsername();
    }

    /** @inheritdoc */
    public getUUID(): UUID {
        return this.player.getUUID();
    }

    public get xuid(): string {
        return this.player.xuid;
    }

    public get platformChatId(): string {
        return this.player.platformChatId;
    }

    public get device(): Device | null {
        return this.player.device;
    }

    public get skin(): Skin | null {
        return this.player.skin;
    }

    /** The player's game mode, which the change log's undo also writes back through here. */
    public get gamemode(): Gametype {
        return this.player.gamemode;
    }
    public set gamemode(gamemode: Gametype) {
        this.player.gamemode = gamemode;
    }

    /** @inheritdoc */
    public isOp(): boolean {
        return this.player.isOp();
    }

    /** @inheritdoc */
    public isFlying(): boolean {
        return this.player.isFlying();
    }
}
