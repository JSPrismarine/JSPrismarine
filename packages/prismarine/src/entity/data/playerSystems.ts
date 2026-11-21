/**
 * The player systems of the entity store: hunger, breath, suffocation, falls, meals and mining, run over every
 * store entity whose client owns its movement (ADR 0008).
 *
 * The rules are the survival rules `entity/survivalPlayer.ts` lists, so each lives once. This
 * module holds a store player's {@link PlayerComponents}, logs every write through the store, and
 * runs the rules from the entity pass, reading only loaded chunks: a player whose block is in a
 * chunk that is not loaded waits for it and loads nothing. A rule that
 * hurts a player runs the blow through the store's damage pipeline (ADR 0013), with the facts the
 * legacy damage path gives the same cause.
 *
 * A store player (`entity/storePlayer.ts`) outlives its entity: it holds its components and its
 * inventory from the login on, and hands them to the systems of each store its entity enters
 * through {@link PlayerSystems.attach}, which logs their writes there and undoes them. Every
 * live player is one, so these systems are a live player's survival.
 */
import type { BedrockCollisionBox } from '@jsprismarine/blocks/geometry';
import { AIR_STATE } from '@jsprismarine/entities';
import { Gametype } from '@jsprismarine/minecraft';
import { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';

import type { EntityPosition } from '@jsprismarine/entities';

import type { ContentBlock, ContentLevelFacts, ContentPosition } from '../../content/world/adapter';
import type { ServerContent } from '../../content/ServerContent';
import type { PlayerContainer, SlotValue } from '../../inventory/slotLog';
import { DROWNING_DAMAGE, FALL_DAMAGE, NATURAL_REGENERATION, ruleIsOn } from '../../content/world/gameRules';
import type { PlainData } from '../../world/changelog/PlainData';
import { DamageCause, damageCauseOf } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { SUFFOCATION_DAMAGE } from '../Environment';
import { EYE_HEIGHT } from '../playerEyes';
import { breathe } from '../playerBreath';
import { PlayerComponents } from '../playerComponents';
import type { PlayerMining } from '../playerComponents';
import type { PlayerShownForm } from '../playerShown';
import {
    addExhaustion,
    addFood,
    addJumpExhaustion,
    addMovementExhaustion,
    applyHungerEffect,
    hungerOutcome,
    peacefulRecovery,
    spendExhaustion
} from '../playerHunger';
import { cushions, land, trackFall } from '../playerFall';
import { beginMeal, cancelMeal, dueMeal } from '../playerMeal';
import { mineTick, stopCracking } from '../playerMining';
import { diedVitals, respawnVitals } from '../playerRespawn';
import type { MiningEvent } from '../playerMining';
import type { StatusEffect } from '../StatusEffect';
import { survivalReaches } from '../survivalPlayer';
import type { SurvivalPlayer } from '../survivalPlayer';
import type { DamageIntent, DamageOutcome } from './damagePipeline';
import type { DataEntity } from './DataEntity';
import { eyesInWall } from './collision';
import { bedrockCauseOf } from './legacyDamage';
import { blockPositionOf } from './position';

/** The largest value a Java statistic holds, `Integer.MAX_VALUE`, which `ServerStatsCounter` clamps to. */
const MAX_STAT_VALUE = 2_147_483_647;

/**
 * Writes whether a player is sneaking and, when it starts, the tick it started on, which is when
 * a shield it holds went up.
 *
 * @param tick - The game tick the client reported it on.
 */
export const writeSneaking = (components: PlayerComponents, sneaking: boolean, tick: number): void => {
    if (!sneaking) components.set('movement.sneakingSince', null);
    else if (components.get('movement.sneakingSince') === null) components.set('movement.sneakingSince', tick);
    components.set('movement.sneaking', sneaking);
};

/** What the player systems need from the runtime that holds them. */
export interface PlayerSystemsPorts {
    /** Logs one write to a store player's state, as `EntityStore.written` does. */
    written(entity: DataEntity, field: string, before: unknown, after: unknown): void;
    /**
     * Logs one write to a slot a store player carries, as `EntityStore.writtenSlot` does, once
     * the entity has entered the store.
     */
    writtenSlot(
        entity: DataEntity,
        container: PlayerContainer,
        slot: number,
        before: SlotValue,
        after: SlotValue
    ): void;
    /** The built content, which decides an item's maximum durability when a slot is undone. */
    content(): ServerContent;
    /** The level, for its game rules. */
    readonly level: ContentLevelFacts;
    /**
     * The store's tick (`EntityStore.tick`), which a meal is counted out on: it only goes forward,
     * where the level clock moves back under `/time set`.
     */
    tick(): number;
    /** The block at a position, or undefined when its chunk is not loaded. */
    blockAt(at: ContentPosition): ContentBlock | undefined;
    /** The runtime id at a position, or undefined when its chunk is not loaded. */
    runtimeIdAt(at: ContentPosition): number | undefined;
    /**
     * The collision boxes of the block at a position, normalized to its cell, or undefined when its
     * chunk is not loaded.
     */
    collisionAt(at: ContentPosition): readonly BedrockCollisionBox[] | undefined;
    /** Sends a level event at a point, such as a tick of crack animation. */
    levelEvent(at: ContentPosition, event: number, data: number): void;
    /** Runs one blow through the store's damage pipeline. */
    damage(intent: DamageIntent): DamageOutcome;
    /** Gives health back, up to the maximum. */
    heal(id: number, amount: number): boolean;
    /** Whether the entity has died and waits to be revived. */
    dying(id: number): boolean;
    /** The item a player holds in its main hand, or undefined for an empty hand or no inventory. */
    heldItem(id: number): string | undefined;
    /** Finishes a player's meal of `item`, which feeds it. */
    finishMeal(id: number, item: string): void;
}

/**
 * What a store player hands the systems when its entity enters a store: its components, and the
 * writers that put back what it keeps beside them.
 */
export interface PlayerParts {
    /** The player's components, which the systems run and log from now on. */
    readonly components: PlayerComponents;
    /** What clients are shown of the player beside its entity, which the entity enters the log with. */
    shownForm(): PlayerShownForm;
    /**
     * Writes a logged field the player keeps beside its components back without logging it, such
     * as `inventory.handSlot`.
     * @returns Whether the player keeps `field`.
     */
    restoreField(field: string, value: PlainData): boolean;
    /**
     * Writes a logged slot back without logging it.
     * @returns Whether the player carries that container and slot.
     */
    restoreSlot(container: string, slot: number, value: PlainData, content: ServerContent): boolean;
    /**
     * The player's ticks since rest, Java's `Stats.TIME_SINCE_REST`: a statistic the player keeps
     * beside its components, which the systems count without logging. Absent, the systems keep it.
     */
    readonly rest?: RestClock;
}

/** Reads and writes a player's ticks since rest. */
export interface RestClock {
    get(): number;
    set(ticks: number): void;
}

/** Where a store player's writes are logged while its entity is in the store. */
export interface PlayerLog {
    /** Logs a write to a component field, or a field kept beside them such as the hand slot. */
    field(field: string, before: unknown, after: unknown): void;
    /** Logs a write to one slot the player carries. */
    slot(container: PlayerContainer, slot: number, before: SlotValue, after: SlotValue): void;
}

/** One store player's state beside its entity. */
interface StorePlayer {
    readonly survival: SurvivalPlayer;
    /** The ticks since rest, the player's own or, for an entity no store player attached to, the systems'. */
    readonly rest: RestClock;
    /** The player's own writers, or undefined for an entity no store player attached to. */
    readonly parts: PlayerParts | undefined;
}

/** The player systems of one store, and the component state of its players. */
export class PlayerSystems {
    private readonly players = new WeakMap<DataEntity, StorePlayer>();

    public constructor(private readonly ports: PlayerSystemsPorts) {}

    /**
     * A store player's components, built the first time they are asked for with a fresh player's
     * values: the same attributes and actor metadata a joining legacy player starts with.
     *
     * @param entity - A store entity whose client owns its movement.
     */
    public componentsOf(entity: DataEntity): PlayerComponents {
        return this.playerOf(entity).survival.components;
    }

    /** A store player's ticks since it last slept or died, Java's `Stats.TIME_SINCE_REST`. */
    public timeSinceRestOf(entity: DataEntity): number {
        return this.playerOf(entity).rest.get();
    }

    /**
     * Takes a store player's parts for its entity, so the player has one set of components and
     * the systems run, log and undo the same fields a save reads. Called before the entity enters
     * the store, so what the player brings is part of the form it enters with and is not logged.
     *
     * @param entity - A store entity whose client owns its movement.
     * @param parts - The player's components and writers, which replace any built for the entity.
     * @returns Where the player logs its writes while the entity is in this store.
     */
    public attach(entity: DataEntity, parts: PlayerParts): PlayerLog {
        this.register(entity, parts.components, parts);
        return {
            field: (field, before, after) => this.ports.written(entity, field, before, after),
            slot: (container, slot, before, after) => this.ports.writtenSlot(entity, container, slot, before, after)
        };
    }

    /**
     * Runs before a store player's components tick. A player's air is the breath system's, so the
     * `minecraft:breathable` the shipped player declares keeps none, and its tick, which reads its
     * own air, does nothing. The component builds its air again whenever it initializes, such as
     * after a component group change, so this clears it before every tick.
     *
     * @param entity - The player.
     */
    public beforeComponents(entity: DataEntity): void {
        entity.instance.componentState.clear(AIR_STATE);
    }

    /**
     * One tick of a store player's systems, in the order a legacy player runs them: breath and
     * hunger for a player they reach, then the meal in progress and the block being mined for any
     * player.
     *
     * @param entity - The player.
     * @param tick - The world tick, which the hunger clock reads.
     */
    public tick(entity: DataEntity, tick: number): void {
        const { survival } = this.playerOf(entity);
        if (survival.vulnerable() && survival.alive()) {
            this.tickBreath(entity, survival);
            this.tickSuffocation(entity);
            this.tickHunger(entity, survival, tick);
        }
        this.tickMeal(entity, survival);
        this.tickMining(survival);
        this.tickRest(entity);
    }

    /**
     * What a store player's death does to its survival state: the drowning in progress ends, and
     * so do the cracks on the block it was mining. The runtime calls this inside the blow that
     * killed it.
     *
     * @param entity - The player who died.
     */
    public died(entity: DataEntity): void {
        diedVitals(this.playerOf(entity).survival);
        // `ServerPlayer.die` resets `Stats.TIME_SINCE_REST` with `TIME_SINCE_DEATH`.
        this.playerOf(entity).rest.set(0);
        this.stopMining(entity);
    }

    /**
     * What a store player's revival gives it besides its health: its attributes back at their
     * defaults, full lungs, and a body that is not running, crouching, flying or sleeping.
     *
     * @param entity - The player coming back.
     */
    public revived(entity: DataEntity): void {
        respawnVitals(this.playerOf(entity).survival);
    }

    /**
     * Sets the block a store player is mining, whose cracks the systems animate every tick until
     * it breaks or the player stops. The start of the cracks is the caller's: `PlayerActionHandler`
     * sends it through `World.startBlockCracking`.
     *
     * @param entity - The player.
     * @param mining - The block, or null when the player stopped or broke it.
     */
    public setMining(entity: DataEntity, mining: PlayerMining | null): void {
        this.componentsOf(entity).set('mining.block', mining);
    }

    /**
     * Stops the cracks on the block a store player was mining, if any, and forgets it, for whatever
     * ends the mining without the client saying so, such as a death.
     *
     * @param entity - The player.
     */
    public stopMining(entity: DataEntity): void {
        const components = this.componentsOf(entity);
        const mining = components.get('mining.block');
        if (mining === null) return;
        components.set('mining.block', null);
        this.send(stopCracking(mining));
    }

    /**
     * Notes that a store player has started eating or drinking what is in its hand, on the store's
     * tick its meal is counted out on.
     *
     * @param entity - The player.
     * @param ticks - How long the meal takes.
     * @returns Whether a meal began, which needs an item in hand.
     */
    public beginMeal(entity: DataEntity, ticks: number): boolean {
        const item = this.ports.heldItem(entity.id);
        if (item === undefined) return false;
        beginMeal(this.componentsOf(entity), this.ports.tick(), ticks, item);
        return true;
    }

    /** Forgets a store player's unfinished meal, as letting go of the button does. */
    public cancelMeal(entity: DataEntity): void {
        cancelMeal(this.componentsOf(entity));
    }

    /**
     * Whether a blow reaches a store player in its game mode. Survival and adventure take every
     * blow. Creative takes only what bypasses invulnerability, Java's `#bypasses_invulnerability`
     * tag, which is the void and `/kill`, and a spectator takes nothing, as Java's
     * `isInvulnerableTo` answers before the tag is consulted.
     *
     * @param entity - The player hurt.
     * @param intent - The blow.
     */
    public reaches(entity: DataEntity, intent: DamageIntent): boolean {
        const gamemode = this.componentsOf(entity).get('abilities.gamemode');
        if (survivalReaches(gamemode)) return true;
        if (gamemode === Gametype.SPECTATOR) return false;
        const { tags } = intent.source;
        if (tags !== undefined) return tags.includes('minecraft:bypasses_invulnerability');
        return DamageSource.of(damageCauseOf(intent.cause)).bypassesInvulnerability();
    }

    /** Writes whether a store player is sprinting, as its client reports it. */
    public setSprinting(entity: DataEntity, sprinting: boolean): void {
        this.componentsOf(entity).set('movement.sprinting', sprinting);
    }

    /**
     * Writes whether a store player is sneaking, as its client reports it, and the tick it began,
     * which is when a shield it holds went up.
     */
    public setSneaking(entity: DataEntity, sneaking: boolean): void {
        writeSneaking(this.componentsOf(entity), sneaking, this.ports.level.gameTime());
    }

    /** Writes a store player's game mode, which decides which blows and survival rules reach it. */
    public setGamemode(entity: DataEntity, gamemode: Gametype): void {
        this.componentsOf(entity).set('abilities.gamemode', gamemode);
    }

    /** Writes whether a store player is flying. Whether its game mode lets it fly is the caller's. */
    public setFlying(entity: DataEntity, flying: boolean): void {
        this.componentsOf(entity).set('abilities.flying', flying);
    }

    /** Makes a store player hungrier, as moving, jumping, attacking and healing do. */
    public exhaust(entity: DataEntity, amount: number): void {
        addExhaustion(this.playerOf(entity).survival, amount);
    }

    /** One tick of a status effect on a store player: the hunger effect drains it, saturation feeds it. */
    public statusEffectTicked(entity: DataEntity, effect: Pick<StatusEffect, 'id' | 'amplifier'>): void {
        applyHungerEffect(this.playerOf(entity).survival, effect.id, effect.amplifier);
    }

    /** Charges a store player for a jump its client reported, four times over for a sprint jump. */
    public jumped(entity: DataEntity): void {
        addJumpExhaustion(this.playerOf(entity).survival);
    }

    /**
     * Ends the fall in progress of a store player the server moved, which the runtime calls
     * beside `MobBody.teleportTo`: a teleport is not a fall, as a legacy player's is not.
     */
    public teleported(entity: DataEntity): void {
        this.componentsOf(entity).set('vitals.fallDistance', 0);
    }

    /**
     * Charges a store player for a move its client reported and adds it to the fall in progress,
     * then pays for the fall if the move landed it, in the order the legacy movement handler
     * runs them: the step, then the ground. The runtime calls this after it wrote the move.
     *
     * @param entity - The player, already at its new position and ground state.
     * @param from - Where it was.
     * @param wasOnGround - Whether it was on the ground before the move.
     */
    public moved(entity: DataEntity, from: EntityPosition, wasOnGround: boolean): void {
        const { survival } = this.playerOf(entity);
        const to = entity.position;
        const flying = survival.components.get('abilities.flying');

        addMovementExhaustion(survival, from, to, flying);
        trackFall(survival, from.y, to.y, { onGround: wasOnGround, flying });
        if (wasOnGround || !entity.body.conditions.has('on_ground')) return;

        const damage = land(survival, ruleIsOn(this.ports.level, FALL_DAMAGE), () => {
            const { x, y, z } = blockPositionOf(to);
            return cushions(
                this.ports.blockAt({ x, y, z })?.identifier,
                this.ports.blockAt({ x, y: y - 1, z })?.identifier
            );
        });
        if (damage !== undefined) this.hurt(entity, DamageCause.Fall, damage);
    }

    /**
     * What clients are shown of a store player beside its entity (`entity/playerShown.ts`).
     * @returns The form, or undefined for an entity no store player attached to.
     */
    public shownFormOf(entity: DataEntity): PlayerShownForm | undefined {
        return this.players.get(entity)?.parts?.shownForm();
    }

    /**
     * Writes a logged field of a store player back, without logging it, for the store's undo: a
     * component field, or one the player keeps beside them.
     *
     * @returns Whether `field` names a field of the player.
     */
    public restore(entity: DataEntity, field: string, value: PlainData): boolean {
        const { survival, parts } = this.playerOf(entity);
        return survival.components.restore(field, value) || (parts?.restoreField(field, value) ?? false);
    }

    /**
     * Writes a logged slot of a store player back, without logging it, for the store's undo.
     *
     * @returns Whether the entity's player carries that container and slot.
     */
    public restoreSlot(entity: DataEntity, container: string, slot: number, value: PlainData): boolean {
        return this.players.get(entity)?.parts?.restoreSlot(container, slot, value, this.ports.content()) ?? false;
    }

    /** Breath, read at the block the player's eyes are in, which a store player's feet are `EYE_HEIGHT` below. */
    private tickBreath(entity: DataEntity, survival: SurvivalPlayer): void {
        const { x, y, z } = entity.position;
        const head = this.ports.blockAt(blockPositionOf({ x, y: y + EYE_HEIGHT, z }));
        const drowning = breathe(survival, head?.identifier, ruleIsOn(this.ports.level, DROWNING_DAMAGE));
        if (drowning !== undefined) this.hurt(entity, DamageCause.Drowning, drowning);
    }

    /**
     * Java's `LivingEntity.baseTick` hurts a body whose eyes are inside a block that suffocates
     * with `in_wall` damage every tick, and the grace period holds that to one blow in
     * {@link SUFFOCATION_INTERVAL} ticks.
     */
    /**
     * Java's `ServerPlayer.doTick` counts `Stats.TIME_SINCE_REST` up every tick the player is not
     * asleep, whatever its game mode, and `startSleeping` sets it back to 0, so it stays there
     * through the night.
     */
    private tickRest(entity: DataEntity): void {
        const { rest } = this.playerOf(entity);
        const sleeping = this.componentsOf(entity).get('movement.sleeping');
        rest.set(sleeping ? 0 : Math.min(MAX_STAT_VALUE, rest.get() + 1));
    }

    private tickSuffocation(entity: DataEntity): void {
        const { x, y, z } = entity.position;
        if (eyesInWall({ x, y: y + EYE_HEIGHT, z }, entity.facts.box.width, this.ports))
            this.hurt(entity, DamageCause.Suffocation, SUFFOCATION_DAMAGE);
    }

    /** The meal in progress, finished once its time is up if the same item is still in hand. */
    private tickMeal(entity: DataEntity, survival: SurvivalPlayer): void {
        const item = dueMeal(survival.components, this.ports.tick(), this.ports.heldItem(entity.id));
        if (item !== undefined) this.ports.finishMeal(entity.id, item);
    }

    /** A tick of crack animation on the block being mined, read from a loaded chunk only. */
    private tickMining(survival: SurvivalPlayer): void {
        const mining = survival.components.get('mining.block');
        if (mining === null) return;

        const step = mineTick(mining, this.ports.runtimeIdAt({ x: mining.x, y: mining.y, z: mining.z }));
        for (const event of step.events) this.send(event);
        if (!step.continues) survival.components.set('mining.block', null);
    }

    private send({ at, event, data }: MiningEvent): void {
        this.ports.levelEvent(at, event, data);
    }

    private tickHunger(entity: DataEntity, survival: SurvivalPlayer, tick: number): void {
        const difficulty = this.ports.level.difficulty();
        const regenerates = ruleIsOn(this.ports.level, NATURAL_REGENERATION);
        const recovery = peacefulRecovery(survival, tick, regenerates, difficulty);
        if (recovery !== undefined) {
            if (recovery.heal > 0) this.ports.heal(entity.id, recovery.heal);
            if (recovery.food > 0) addFood(survival.components, recovery.food);
        }

        spendExhaustion(survival.components, difficulty);
        const outcome = hungerOutcome(survival, tick, regenerates, difficulty);
        if (outcome?.kind === 'starve') this.hurt(entity, DamageCause.Starvation, outcome.amount);
        else if (outcome?.kind === 'regenerate' && this.ports.heal(entity.id, outcome.amount))
            addExhaustion(survival, outcome.exhaustion);
    }

    /**
     * Runs a survival rule's blow through the pipeline with the facts the legacy damage path gives
     * its cause: the grace period, the mitigation and what the cause bypasses.
     */
    private hurt(entity: DataEntity, cause: DamageCause, amount: number): void {
        const source = DamageSource.of(cause);
        this.ports.damage({
            target: entity.id,
            cause: bedrockCauseOf(source),
            amount,
            source: {
                route: 'component',
                graced: true,
                mitigated: true,
                bypassesArmor: source.bypassesArmor(),
                bypassesEnchantments: source.bypassesEnchantments(),
                bypassesGrace: source.bypassesInvulnerability()
            }
        });
    }

    /**
     * The entity's player, built the first time with fresh components for an entity no store
     * player attached to, such as one a test or a command spawned.
     */
    private playerOf(entity: DataEntity): StorePlayer {
        return (
            this.players.get(entity) ??
            this.register(
                entity,
                new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), (field, before, after) =>
                    this.ports.written(entity, field, before, after)
                ),
                undefined
            )
        );
    }

    private register(entity: DataEntity, components: PlayerComponents, parts: PlayerParts | undefined): StorePlayer {
        const health = () => entity.instance.attributes.get('health');
        let kept = 0;
        const player: StorePlayer = {
            rest: parts?.rest ?? {
                get: () => kept,
                set: (ticks) => {
                    kept = ticks;
                }
            },
            survival: {
                components,
                vulnerable: () => survivalReaches(components.get('abilities.gamemode')),
                alive: () => (health()?.current ?? 0) > 0 && !this.ports.dying(entity.id),
                health: () => health()?.current ?? 0,
                maxHealth: () => health()?.max ?? 0
            },
            parts
        };
        this.players.set(entity, player);
        return player;
    }
}
