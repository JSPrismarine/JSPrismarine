/**
 * Paintings: which picture a placed painting shows, after Java 26.3's `Painting.create`, and the
 * name a Bedrock client draws it by.
 *
 * The pictures are Java's `painting_variant` registry, which the vanilla datapack fills with one
 * file per variant naming its `asset_id` and its size in blocks. A painting placed from the item
 * takes one of the variants the `minecraft:placeable` tag holds: of those that fit on the wall,
 * the ones with the largest area, one of them at random.
 */
import { isRecord } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { ServerContent } from '../../content/ServerContent';

/** The painting entity, the one hanging entity that shows a variant. */
export const PAINTING = 'minecraft:painting';

/** The tag of the variants a placed painting may draw, Java's `PaintingVariantTags.PLACEABLE`. */
const PLACEABLE_TAG = 'minecraft:placeable';

/** One picture a painting can show. */
export interface PaintingVariant {
    /** The registry id, such as `minecraft:kebab`. */
    readonly id: string;
    /** The texture it draws, such as `minecraft:kebab`. */
    readonly assetId: string;
    /** Its width in blocks. */
    readonly width: number;
    /** Its height in blocks. */
    readonly height: number;
}

const isText = (value: unknown): value is string => typeof value === 'string';

/** One painting's picture: the variant and its size, saved with the painting. */
export const paintingState = defineComponentState('jsprismarine:painting', {
    variant: isText,
    assetId: isText,
    width: stateField.number,
    height: stateField.number
});

/** The field the replica holds a painting's picture in. */
export const PAINTING_STATE_FIELD = `component:${paintingState.component}`;

/** One variant file, or undefined when it does not give a size and a texture. */
const variantOf = (id: string, data: unknown): PaintingVariant | undefined => {
    if (!isRecord(data)) return undefined;
    const { asset_id: assetId, width, height } = data;
    if (!isText(assetId) || typeof width !== 'number' || typeof height !== 'number') return undefined;
    return { id, assetId, width, height };
};

/**
 * The variants a placed painting may draw from, in the order the `minecraft:placeable` tag lists
 * them, which is the order Java's `Painting.create` collects them in.
 */
export const placeablePaintingVariants = (content: ServerContent): readonly PaintingVariant[] =>
    content.tags
        .members('painting_variant', PLACEABLE_TAG)
        .flatMap((id) => variantOf(id, content.definitions.paintingVariants.get(id)?.data) ?? []);

/** Java's `Painting.variantArea`. */
export const variantArea = (variant: { readonly width: number; readonly height: number }): number =>
    variant.width * variant.height;

/**
 * The paintings a Bedrock client draws under their own texture, `textures/painting/<name>.png` in
 * Bedrock's resource pack, which it names by that file. Every other painting is a tile of the
 * `kz` atlas, which the client names in `PascalCase`, `skull_and_roses` as `SkullAndRoses`.
 */
const OWN_TEXTURE = new Set([
    'backyard',
    'baroque',
    'bouquet',
    'cavebird',
    'changing',
    'cotan',
    'dennis',
    'endboss',
    'fern',
    'finding',
    'humble',
    'lowmist',
    'meditative',
    'orb',
    'owlemons',
    'passage',
    'pond',
    'prairie_ride',
    'sunflowers',
    'tides',
    'unpacked'
]);

/** The paintings a Bedrock client draws under their own texture file; see {@link bedrockPaintingMotif}. */
export const paintingsWithOwnTexture = (): ReadonlySet<string> => OWN_TEXTURE;

/**
 * The motif a Bedrock client draws a Java painting asset by, which `AddPaintingPacket` carries.
 * @param assetId - The variant's `asset_id`, such as `minecraft:skull_and_roses`.
 */
export const bedrockPaintingMotif = (assetId: string): string => {
    const name = assetId.slice(assetId.indexOf(':') + 1);
    if (OWN_TEXTURE.has(name)) return name;
    return name
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
};
