import type { NBTTagCompound } from '@jsprismarine/nbt';

/** An integer position in template space, relative to the template's origin corner. */
export type TemplatePosition = readonly [x: number, y: number, z: number];

/** A fractional position, as entity coordinates are stored. */
export type EntityPosition = readonly [x: number, y: number, z: number];

/** Raised when bytes are not a readable structure template. */
export class StructureFormatError extends Error {
    public override name = 'StructureFormatError';
}

/** One Java Edition block state: a namespaced identifier and its property values. */
export interface JavaBlockState {
    /** The namespaced Java block identifier, for example `minecraft:oak_stairs`. */
    readonly name: string;
    /** Property values by property name; empty for a block with no properties. */
    readonly properties: Readonly<Record<string, string>>;
}

/** One block of a Java template: where it sits, which palette entry it uses, and its block entity. */
export interface JavaTemplateBlock {
    readonly pos: TemplatePosition;
    /** Index into the template's palette. */
    readonly state: number;
    /** The block entity NBT the template carries, left as read. */
    readonly nbt?: NBTTagCompound;
}

/** One entity of a template, with its fractional position and the block it was anchored to. */
export interface TemplateEntity {
    readonly pos: EntityPosition;
    /** The block position the entity was saved against; absent in `.mcstructure` files. */
    readonly blockPos?: TemplatePosition;
    /** The entity NBT, left as read. */
    readonly nbt?: NBTTagCompound;
}

/** Which spelling of the palette entry keys a Java template file used. */
export type JavaPaletteKeySpelling = 'Name' | 'id';

/** A Java Edition structure template, as the `.nbt` file holds it. */
export interface JavaStructureTemplate {
    /** The template's extent in blocks. */
    readonly size: TemplatePosition;
    /**
     * The block state palette the blocks index into. For a file with
     * randomized palettes this is the first variant.
     */
    readonly palette: readonly JavaBlockState[];
    /**
     * Every variant of a `palettes` list, in file order. Absent for the
     * common file that carries a single `palette`.
     */
    readonly paletteVariants?: readonly (readonly JavaBlockState[])[];
    readonly blocks: readonly JavaTemplateBlock[];
    readonly entities: readonly TemplateEntity[];
    /** Mojang's world data version, absent in the oldest files, which carry `version` instead. */
    readonly dataVersion?: number;
    /** The pre-`DataVersion` format number; 1 in the files that carry it. */
    readonly version?: number;
    readonly author?: string;
    /** The palette entry key spelling the file actually used. */
    readonly paletteKeySpelling: JavaPaletteKeySpelling;
}

/** One Bedrock block state: the identifier and its state values. */
export interface BedrockBlockState {
    /** The namespaced Bedrock block identifier. */
    readonly name: string;
    /** The Bedrock state values for the identifier. */
    readonly states: Readonly<Record<string, string | number>>;
}

/** The palette index that means "this layer holds no block". */
export const NO_BLOCK = -1;

/** One block of a Bedrock-shaped template, over Bedrock's two storage layers. */
export interface BedrockTemplateBlock {
    readonly pos: TemplatePosition;
    /** Palette index for the primary layer, or {@link NO_BLOCK}. */
    readonly state: number;
    /** Palette index for the second layer, which carries waterlogging, or {@link NO_BLOCK}. */
    readonly extraState: number;
    /** The block entity NBT, left as read. */
    readonly nbt?: NBTTagCompound;
    /** Scheduled tick delays a `.mcstructure` saved for this position, in ticks. */
    readonly tickDelays?: readonly number[];
}

/**
 * A structure template in Bedrock block states, which is the shape the server
 * places. Both readers and the Java translation produce this.
 */
export interface BedrockStructureTemplate {
    readonly size: TemplatePosition;
    readonly palette: readonly BedrockBlockState[];
    readonly blocks: readonly BedrockTemplateBlock[];
    readonly entities: readonly TemplateEntity[];
    /** The world position the template was saved from, when the file records one. */
    readonly worldOrigin?: TemplatePosition;
    /**
     * The block state version stamp a `.mcstructure` palette carries for each
     * entry, parallel to {@link BedrockStructureTemplate.palette}. States
     * saved by an older game version need upgrading before placement, and
     * this is the only record of which version wrote them.
     */
    readonly paletteVersions?: readonly number[];
}
