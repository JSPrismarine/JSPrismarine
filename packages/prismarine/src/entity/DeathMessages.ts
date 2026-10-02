import { DamageCause } from './DamageCause';
import type { DamageSource } from './DamageSource';
import type { Entity } from './Entity';

/**
 * How a death is announced.
 *
 * The server never writes the sentence. It sends the vanilla translation key and the names to
 * fill it with, and the client renders it in whatever language it is set to - which is why
 * these are `%`-prefixed keys rather than English, and why a German player sees German.
 *
 * Two tables rather than one, because most causes have two forms: dying in a fire is
 * "went up in flames", and dying in a fire somebody set is "was burnt to a crisp whilst
 * fighting Steve". The second table only holds the causes where a killer changes the wording.
 * @see https://minecraft.wiki/w/Death_messages
 */

/** What the client is told, and renders itself. */
export interface DeathMessage {
    /** The vanilla translation key, `%`-prefixed as the chat packet expects. */
    key: string;
    /** Fills the key's `%1$s`, `%2$s`: the victim first, the killer second where there is one. */
    parameters: string[];
}

/** The identifier every human entity carries; a killer with this one is a person, not a mob. */
const PLAYER_TYPE = 'minecraft:player';

/** Deaths with nobody to blame. One parameter, the victim. */
const UNATTRIBUTED: Record<DamageCause, string> = {
    [DamageCause.Generic]: '%death.attack.generic',
    [DamageCause.Drowning]: '%death.attack.drown',
    [DamageCause.Starvation]: '%death.attack.starve',
    [DamageCause.Fall]: '%death.fell.accident.generic',
    [DamageCause.Fire]: '%death.attack.inFire',
    [DamageCause.Lava]: '%death.attack.lava',
    [DamageCause.Void]: '%death.attack.outOfWorld',
    [DamageCause.Attack]: '%death.attack.generic',
    [DamageCause.Projectile]: '%death.attack.generic',
    [DamageCause.Explosion]: '%death.attack.explosion',
    [DamageCause.Contact]: '%death.attack.cactus',
    [DamageCause.Suffocation]: '%death.attack.inWall',
    [DamageCause.Magic]: '%death.attack.magic',
    [DamageCause.Wither]: '%death.attack.wither',
    [DamageCause.Thorns]: '%death.attack.generic'
};

/**
 * The same deaths with somebody to blame. Two parameters, victim then killer.
 *
 * A cause missing from here is one where knowing the killer does not change what happened -
 * drowning is drowning whoever pushed you in.
 */
const ATTRIBUTED: Partial<Record<DamageCause, string>> = {
    [DamageCause.Attack]: '%death.attack.player',
    [DamageCause.Projectile]: '%death.attack.arrow',
    [DamageCause.Explosion]: '%death.attack.explosion.player',
    [DamageCause.Magic]: '%death.attack.indirectMagic',
    [DamageCause.Thorns]: '%death.attack.thorns',
    // The `.player` suffix is vanilla's for "whilst fighting somebody", and pairs with the
    // unattributed key above rather than with `onFire`, which is a different death.
    [DamageCause.Fire]: '%death.attack.inFire.player'
};

/**
 * What to call an entity in a death message.
 *
 * A player is their username and a named mob is its nametag. Everything else is its type, tidied
 * up: `minecraft:zombie_villager` reads as `Zombie Villager`. Deliberately plain text rather than
 * the `%entity.zombie.name` key vanilla uses, because a translation key nested inside another
 * key's parameter is not something every client resolves - and a message that renders as the raw
 * key is worse than one that renders in English.
 * @param {Entity} entity - Who to name.
 * @returns {string} A name fit to put in a sentence.
 */
const displayNameOf = (entity: Entity): string => {
    const nametag = entity.getName();
    if (nametag) return nametag;

    return entity
        .getType()
        .replace(/^[^:]+:/, '')
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

/**
 * Whether an entity is a person rather than a mob, without importing `Player`.
 *
 * By identifier and not by `instanceof`, because `Player` imports this module and importing it
 * back would close a runtime cycle - the very thing the barrel rules in `eslint.config.js` are
 * there to prevent.
 * @param {Entity} entity - The entity to test.
 * @returns {boolean} `true` for a player.
 */
const isPlayer = (entity: Entity): boolean => entity.getType() === PLAYER_TYPE;

/**
 * The line to announce a death with.
 * @param {Entity} victim - Who died.
 * @param {DamageSource} source - What killed them, and who is answerable for it.
 * @returns {DeathMessage} The key and its parameters.
 * @example
 * ```typescript
 * deathMessage(steve, DamageSource.entity(alex));
 * // => { key: '%death.attack.player', parameters: ['Steve', 'Alex'] }
 * ```
 */
export const deathMessage = (victim: Entity, source: DamageSource): DeathMessage => {
    const killer = source.attacker;

    // Killing yourself is still an accident: vanilla does not say "Steve was slain by Steve".
    if (killer && killer !== victim) {
        const attributed = ATTRIBUTED[source.cause];

        if (attributed) {
            // Vanilla distinguishes the two only for a plain blow, where being slain by a person
            // and being slain by a zombie are different sentences.
            const key = source.cause === DamageCause.Attack && !isPlayer(killer) ? '%death.attack.mob' : attributed;

            return { key, parameters: [displayNameOf(victim), displayNameOf(killer)] };
        }
    }

    return { key: UNATTRIBUTED[source.cause], parameters: [displayNameOf(victim)] };
};
