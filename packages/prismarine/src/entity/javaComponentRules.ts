/**
 * Java's rules for the few components a vanilla entity file writes differently from Java's
 * class, rewritten into each file as it loads.
 *
 * Each rule is a server-decided number the client never draws, so Java decides it, the way
 * Java's air supply does in `javaAirSupply.ts`
 * ([ADR 0001](../../../../docs/adr/0001-entity-stat-authority.md)). The parity suite reads the
 * same numbers out of the pinned Java jar and fails when one drifts.
 */
import { entityFileIdentifier, withComponentRewritten } from './definitionOverlay';

/** One component of one entity file that Java's class decides. */
interface JavaComponentRule {
    readonly component: string;
    /** The body Java's class means, or undefined when Java's type has no such behavior at all. */
    readonly rewrite: (body: Record<string, unknown>) => Record<string, unknown> | undefined;
}

/** The rules by Bedrock entity identifier. */
export const JAVA_COMPONENT_RULES: Readonly<Record<string, readonly JavaComponentRule[]>> = {
    // `Axolotl.handleAirSupply` dries an axolotl out on land by 2 `dryOut` damage each time its
    // air reaches -20, a second apart. Bedrock's dried-out group hurts it 1 every half second.
    'minecraft:axolotl': [
        {
            component: 'minecraft:damage_over_time',
            rewrite: (body) => ({ ...body, damage_per_hurt: 2, time_between_hurt: 1 })
        }
    ],
    // `MinecartTNT.<init>` sets `explosionPowerBase` to 4, which a minecart at rest explodes with.
    'minecraft:tnt_minecart': [{ component: 'minecraft:explode', rewrite: (body) => ({ ...body, power: 4 }) }],
    // Java's creaking is not in `freeze_immune_entity_types` and `Creaking` keeps `Entity.canFreeze`,
    // so powder snow freezes it.
    'minecraft:creaking': [{ component: 'minecraft:freezing_immune', rewrite: () => undefined }]
};

/**
 * Applies {@link JAVA_COMPONENT_RULES} to one entity file in the shape a behavior pack writes.
 *
 * @param data - The parsed JSON of an entity file.
 * @returns The same object for a file no rule names; otherwise a copy with each rule applied.
 */
export const withJavaComponentRules = (data: unknown): unknown => {
    const identifier = entityFileIdentifier(data);
    const rules = identifier === undefined ? undefined : JAVA_COMPONENT_RULES[identifier];
    return (rules ?? []).reduce((file, rule) => withComponentRewritten(file, rule.component, rule.rewrite), data);
};
