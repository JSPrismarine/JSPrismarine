import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

/** Java's `AbstractArrow` types, as Bedrock names the ones it has. */
const ARROWS: ReadonlySet<string> = new Set(
    ['minecraft:arrow', 'minecraft:spectral_arrow', 'minecraft:trident'].flatMap((javaId) => {
        const mapped = javaEntityTypeToBedrock(javaId);
        return mapped.kind === 'mapped' ? [mapped.bedrock] : [];
    })
);

/** Whether an entity type is one of Java's `AbstractArrow` types. */
export const isArrow = (identifier: string): boolean => ARROWS.has(identifier);
