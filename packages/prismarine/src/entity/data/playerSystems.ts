/**
 * The player systems of the entity store: hunger, breath, falls, meals and mining, run over every
 * store entity whose client owns its movement (ADR 0008).
 *
 * The rules are the ones a legacy `Player` runs (`entity/survivalPlayer.ts` lists their files),
 * so each lives once. This module holds a store player's {@link PlayerComponents}, logs every
 * write through the store, and runs the rules from the entity pass, reading only loaded chunks: a
 * player whose block is in a chunk that is not loaded waits for it and loads nothing. A rule that
 * hurts a player runs the blow through the store's damage pipeline (ADR 0013), with the facts the
 * legacy damage path gives the same cause.
 *
 * No live player is a store entity until C4h, so this runs in tests only. C4e and C4f can move
 * the components onto the entity unchanged.
 */
import { AIR_STATE } from '@jsprismarine/entities';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

import type { ContentBlock, ContentLevelFacts, ContentPosition } from '../../content/world/adapter';
import { DROWNING_DAMAGE, NATURAL_REGENERATION, ruleIsOn } from '../../content/world/gameRules';
import type { PlainData } from '../../world/changelog/PlainData';
import { DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { EYE_HEIGHT } from '../Human';
import { breathe } from '../playerBreath';
import { PlayerComponents } from '../playerComponents';
import { addExhaustion, hungerOutcome } from '../playerHunger';
import type { SurvivalPlayer } from '../survivalPlayer';
import type { DamageIntent, DamageOutcome } from './damagePipeline';
import type { DataEntity } from './DataEntity';
import { bedrockCauseOf } from './legacyDamage';

/** What the player systems need from the runtime that holds them. */
export interface PlayerSystemsPorts {
    /** Logs one write to a store player's state, as `EntityStore.written` does. */
    written(entity: DataEntity, field: string, before: unknown, after: unknown): void;
    /** The level, for its game rules. */
    readonly level: ContentLevelFacts;
    /** The block at a position, or undefined when its chunk is not loaded. */
    blockAt(at: ContentPosition): ContentBlock | undefined;
    /** Runs one blow through the store's damage pipeline. */
    damage(intent: DamageIntent): DamageOutcome;
    /** Gives health back, up to the maximum. */
    heal(id: number, amount: number): boolean;
    /** Whether the entity has died and waits to be revived. */
    dying(id: number): boolean;
}

/** One store player's state beside its entity. */
interface StorePlayer {
    readonly survival: SurvivalPlayer;
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
     * One tick of a store player's systems, in the order a legacy player runs them: breath, then
     * hunger.
     *
     * @param entity - The player.
     * @param tick - The world tick, which the hunger clock reads.
     */
    public tick(entity: DataEntity, tick: number): void {
        const { survival } = this.playerOf(entity);
        if (!survival.vulnerable() || !survival.alive()) return;

        this.tickBreath(entity, survival);
        this.tickHunger(entity, survival, tick);
    }

    /**
     * Writes a logged component field of a store player back, without logging it, for the store's
     * undo.
     *
     * @returns Whether `field` names a player component field.
     */
    public restore(entity: DataEntity, field: string, value: PlainData): boolean {
        return this.playerOf(entity).survival.components.restore(field, value);
    }

    /** Breath, read at the block the player's eyes are in, which a store player's feet are {@link EYE_HEIGHT} below. */
    private tickBreath(entity: DataEntity, survival: SurvivalPlayer): void {
        const { x, y, z } = entity.position;
        const head = this.ports.blockAt({ x: Math.floor(x), y: Math.floor(y + EYE_HEIGHT), z: Math.floor(z) });
        const drowning = breathe(survival, head?.identifier, ruleIsOn(this.ports.level, DROWNING_DAMAGE));
        if (drowning !== undefined) this.hurt(entity, DamageCause.Drowning, drowning);
    }

    private tickHunger(entity: DataEntity, survival: SurvivalPlayer, tick: number): void {
        const outcome = hungerOutcome(survival, tick, ruleIsOn(this.ports.level, NATURAL_REGENERATION));
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

    private playerOf(entity: DataEntity): StorePlayer {
        const known = this.players.get(entity);
        if (known !== undefined) return known;

        const components = new PlayerComponents(
            new Attributes(Attributes.getPlayerDefaults()),
            (field, before, after) => this.ports.written(entity, field, before, after)
        );
        const health = () => entity.instance.attributes.get('health');
        const player: StorePlayer = {
            survival: {
                components,
                // Game mode is not a store component yet, so every store player is in survival
                // until C4h moves the live player's game mode onto the entity.
                vulnerable: () => true,
                alive: () => (health()?.current ?? 0) > 0 && !this.ports.dying(entity.id),
                health: () => health()?.current ?? 0,
                maxHealth: () => health()?.max ?? 0
            }
        };
        this.players.set(entity, player);
        return player;
    }
}
