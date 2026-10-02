/**
 * What hurt an entity. Carried through so a death can be reported as what it was, and so
 * the things that ignore particular kinds of damage have something to test.
 *
 * Its own file rather than a member of `Entity`, because `DamageSource` has to name both this
 * and `Entity`, and `Entity` has to name `DamageSource` - which is the runtime cycle the import
 * rules in `eslint.config.js` exist to prevent. `Entity` re-exports it, so the older
 * `import { DamageCause } from './entity/Entity'` still resolves and nothing had to be rewritten.
 */
export enum DamageCause {
    Generic = 'generic',
    Drowning = 'drowning',
    Starvation = 'starvation',
    Fall = 'fall',
    /** Standing in flames, or burning after having stood in them. */
    Fire = 'fire',
    /** In the lava itself, which hurts far faster than the fire it leaves behind. */
    Lava = 'lava',
    Void = 'void',
    /** Struck by something holding a weapon, or a fist. */
    Attack = 'attack',
    /** Hit by something thrown or fired, which is not the same as being struck by its owner. */
    Projectile = 'projectile',
    Explosion = 'explosion',
    /** Walked into something that hurts to touch: a cactus, a berry bush. */
    Contact = 'contact',
    /** A solid block where the entity's head is. */
    Suffocation = 'suffocation',
    /** Potions and the like, which armour does nothing about. */
    Magic = 'magic',
    Wither = 'wither',
    /** Reflected back at an attacker by the armour they hit. */
    Thorns = 'thorns'
}

export default DamageCause;
