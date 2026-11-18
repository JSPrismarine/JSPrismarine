/**
 * The entity events a level's scripts hear, `world.afterEvents.entitySpawn`, `entityHurt` and
 * `entityDie`, from the server's `entitySpawn`, `entityHurt` and `entityDeath` events, and the
 * translation between a {@link DamageSource} and the Script API's `EntityDamageSource`.
 */
import type {
    ScriptDamageSource,
    ScriptEntityRef,
    ScriptSpawnCause,
    ScriptWorldEvent
} from '@jsprismarine/script-host/host/world';

import { DamageCause, damageCauseOf } from '../entity/DamageCause';
import { DamageSource } from '../entity/DamageSource';
import type { StoreActor } from '../entity/data/storeActors';
import type { EntitySpawnCause } from '../events/entity/EntitySpawnEvent';
import type Server from '../Server';
import type { Level } from '../world/Level';

/** An entity event the scripts hear. */
export type ScriptEntityEvent = Extract<ScriptWorldEvent, { type: 'entitySpawn' | 'entityHurt' | 'entityDie' }>;

/** Each cause as `EntityDamageCause` names it. A blow with no cause of its own is `none`, as on BDS. */
const SCRIPT_CAUSES: Readonly<Record<DamageCause, string>> = {
    [DamageCause.Generic]: 'none',
    [DamageCause.Drowning]: 'drowning',
    [DamageCause.Starvation]: 'starve',
    [DamageCause.Fall]: 'fall',
    [DamageCause.Fire]: 'fire',
    [DamageCause.Lava]: 'lava',
    [DamageCause.Void]: 'void',
    [DamageCause.Attack]: 'entityAttack',
    [DamageCause.Projectile]: 'projectile',
    [DamageCause.Explosion]: 'entityExplosion',
    [DamageCause.SonicBoom]: 'sonicBoom',
    [DamageCause.Contact]: 'contact',
    [DamageCause.Suffocation]: 'suffocation',
    [DamageCause.Magic]: 'magic',
    [DamageCause.Wither]: 'wither',
    [DamageCause.Thorns]: 'thorns',
    [DamageCause.SelfDestruct]: 'selfDestruct'
};

/** Each spawn cause as `EntityInitializationCause` names it. */
const SPAWN_CAUSES: Readonly<Record<EntitySpawnCause, ScriptSpawnCause>> = {
    spawned: 'Spawned',
    born: 'Born',
    transformed: 'Transformed',
    primed: 'Event',
    loaded: 'Loaded'
};

/** An entity as the scripts name it: its runtime id and its type. */
export const scriptEntityRef = (actor: StoreActor): ScriptEntityRef => ({
    id: String(actor.getRuntimeId()),
    typeId: actor.getType()
});

/** A damage source as `EntityDamageSource` reads it. */
export const scriptDamageSource = (source: DamageSource): ScriptDamageSource => ({
    cause: SCRIPT_CAUSES[source.cause],
    ...(source.attacker === null ? {} : { damagingEntity: scriptEntityRef(source.attacker) }),
    ...(source.projectile === null ? {} : { damagingProjectile: scriptEntityRef(source.projectile) })
});

/**
 * The damage source a script's `applyDamage` describes.
 * @param actorOf - Finds a live entity by the id the scripts know it by.
 */
export const damageSourceOfScript = (
    source: ScriptDamageSource,
    actorOf: (id: string) => StoreActor | undefined
): DamageSource => {
    // `entityAttack` is the server's `entity_attack`, which names the attack cause.
    const cause = damageCauseOf(source.cause.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
    const attacker = source.damagingEntity === undefined ? undefined : actorOf(source.damagingEntity.id);
    const projectile = source.damagingProjectile === undefined ? undefined : actorOf(source.damagingProjectile.id);
    if (attacker === undefined && projectile === undefined) return DamageSource.of(cause);
    return new DamageSource({ cause, attacker: attacker ?? null, projectile: projectile ?? null });
};

/**
 * Hears the entity events of one level's worlds. The server raises no `entitySpawn` for a player,
 * whose arrival the player events tell.
 * @returns A function that stops it.
 */
export const levelEntityEvents =
    (server: Server, level: Level) =>
    (listener: (event: ScriptEntityEvent) => void): (() => void) => {
        const here = (actor: StoreActor): boolean => actor.getWorld().getLevel() === level;
        const { events } = server.getKernel();
        const stops = [
            events.on('entitySpawn', (event) => {
                const actor = event.getEntity();
                if (!here(actor)) return;
                listener({
                    type: 'entitySpawn',
                    entity: scriptEntityRef(actor),
                    cause: SPAWN_CAUSES[event.getCause()]
                });
            }),
            events.on('entityHurt', (event) => {
                const actor = event.getEntity();
                if (!here(actor)) return;
                listener({
                    type: 'entityHurt',
                    entity: scriptEntityRef(actor),
                    damage: event.getDamage(),
                    source: scriptDamageSource(event.getSource())
                });
            }),
            events.on('entityDeath', (event) => {
                const actor = event.getEntity();
                if (!here(actor)) return;
                listener({
                    type: 'entityDie',
                    entity: scriptEntityRef(actor),
                    source: scriptDamageSource(event.getSource())
                });
            })
        ];
        return () => {
            for (const stop of stops) stop();
        };
    };
