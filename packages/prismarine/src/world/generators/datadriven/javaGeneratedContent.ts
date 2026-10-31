/**
 * The block entities and the entities a decoration pass leaves behind, in the shape a chunk keeps.
 *
 * `@jsprismarine/features` names Java block entity types, Java entity types and Java loot tables,
 * because that is what Mojang's feature data names. A chunk stores Bedrock NBT that
 * `BlockEntityRegistry` reads back and Bedrock identifiers that the entity classes answer to, so
 * the rewrite happens here, beside the other Java-to-Bedrock steps the generator takes.
 */
import type { BlockEntityRequest } from '@jsprismarine/features';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import type { BlockEntity } from '../../../blockentity/BlockEntity';
import { BlockEntityRegistry } from '../../../blockentity/BlockEntityRegistry';
import { bedrockBlockEntityIdForJavaType } from '../../../blockentity/bedrockBlockEntityIds';
import { applyJavaBlockEntityContent } from '../../../blockentity/javaBlockEntityContent';
import { bedrockLootPathOf } from '../../../content/lootTablePaths';
import type { EntitySpawn } from '../../EntitySpawn';
import type { RegionBlockEntity, RegionEntitySpawn } from './GenerationRegion';

/** Java's `LegacyRandomSource` multiplier, reused here only to spread the bits of a position. */
const SCRAMBLE = 0x5deece66dn;

/**
 * The seed a generated container rolls its loot with.
 *
 * Java draws it from the feature's own random, which does not reach this far: the feature hands
 * over a loot table and nothing else. Mixing the world seed with the position instead keeps the
 * chest's contents a property of the world rather than of when the chunk happened to generate,
 * which is the part a player can tell apart.
 */
const lootSeedOf = (seed: bigint, x: number, y: number, z: number): number => {
    const mixed = (seed ^ (BigInt(x) * 341873128712n + BigInt(y) * 132897987541n + BigInt(z))) * SCRAMBLE;
    return Number(BigInt.asIntN(32, mixed >> 16n));
};

/**
 * Builds the block entity a feature asked for.
 *
 * @returns The block entity, or undefined for a Java type Bedrock has no counterpart for, which
 *   leaves the block itself in place rather than the chunk unreadable.
 */
export const createBlockEntity = (placed: RegionBlockEntity, seed: bigint): BlockEntity | undefined => {
    const id = bedrockBlockEntityIdForJavaType(placed.request.id);
    if (id === undefined) return undefined;

    const nbt = new NBTTagCompound('');
    nbt.addValue('id', new Types.StringVal(id));
    nbt.addValue('x', new Types.NumberVal(placed.x));
    nbt.addValue('y', new Types.NumberVal(placed.y));
    nbt.addValue('z', new Types.NumberVal(placed.z));
    nbt.addValue('isMovable', new Types.ByteVal(1));

    addRequestedFields(nbt, placed, seed);
    return BlockEntityRegistry.fromNBT(nbt);
};

/** The fields that depend on what the feature asked for, rather than on the block being one. */
const addRequestedFields = (nbt: NBTTagCompound, placed: RegionBlockEntity, seed: bigint): void => {
    const request: BlockEntityRequest = placed.request;

    if (request.lootTable !== undefined) {
        // Left unrolled, as the game leaves it: a generated chest fills the first time a player
        // opens it, which is what makes the contents depend on that player's luck.
        nbt.addValue('LootTable', new Types.StringVal(bedrockLootPathOf(request.lootTable)));
        nbt.addValue('LootTableSeed', new Types.NumberVal(lootSeedOf(seed, placed.x, placed.y, placed.z)));
    }

    if (request.spawnEntity !== undefined) {
        const entity = bedrockEntityTypeOf(request.spawnEntity);
        // The rest of a spawner's fields are the ones the game fills in from its own defaults.
        if (entity !== undefined) nbt.addValue('EntityIdentifier', new Types.StringVal(entity));
        nbt.addValue('Delay', new Types.ShortVal(0));
    }

    if (request.exitPortal !== undefined) {
        const exit = new NBTTagCompound('ExitPortal');
        exit.addValue('X', new Types.NumberVal(request.exitPortal.x));
        exit.addValue('Y', new Types.NumberVal(request.exitPortal.y));
        exit.addValue('Z', new Types.NumberVal(request.exitPortal.z));
        nbt.addChild(exit);
        nbt.addValue('Age', new Types.LongVal(0n));
    }

    // Everything a structure template saved beyond the fields above: a banner's color and
    // layers, a sign's text, a pot's sherds, a vault's key, a container's stacks.
    if (request.saved instanceof NBTTagCompound) {
        applyJavaBlockEntityContent(nbt, request.saved, {
            ...(request.javaBlock === undefined ? {} : { javaBlock: request.javaBlock })
        });
    }

    if (request.exactTeleport !== undefined) {
        // Bedrock's end gateway has no such field. It is written anyway because the generic
        // block entity carries unmodeled tags back out untouched, so the gateway keeps the
        // exactness the feature asked for instead of losing it at the first save.
        nbt.addValue('ExactTeleport', new Types.ByteVal(request.exactTeleport ? 1 : 0));
    }
};

/**
 * Translates an entity a feature asked for into the spawn a chunk hands the world on load.
 *
 * @returns The spawn, or undefined for a Java entity type with no Bedrock counterpart at all.
 */
export const createEntitySpawn = (spawn: RegionEntitySpawn): EntitySpawn | undefined => {
    const type = bedrockEntityTypeOf(spawn.type);
    if (type === undefined) return undefined;

    return {
        type,
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
        yaw: spawn.yaw,
        ...(spawn.beamTarget === undefined ? {} : { beamTarget: spawn.beamTarget }),
        ...(spawn.showBottom === undefined ? {} : { showBottom: spawn.showBottom }),
        ...(spawn.invulnerable === undefined ? {} : { invulnerable: spawn.invulnerable })
    };
};

/** The Bedrock identifier for a Java entity type, taking a reviewed loss's substitute. */
const bedrockEntityTypeOf = (javaId: string): string | undefined => {
    const mapped = javaEntityTypeToBedrock(javaId);
    switch (mapped.kind) {
        case 'mapped':
        case 'passthrough':
            return mapped.bedrock;
        case 'loss':
            return mapped.loss.bedrockFallback;
        case 'unknown':
            return undefined;
    }
};
