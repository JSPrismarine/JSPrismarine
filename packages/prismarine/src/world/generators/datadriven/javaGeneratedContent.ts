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
import { bedrockLootPathOf } from '../../../content/lootTablePaths';
import type { EntitySpawn } from '../../EntitySpawn';
import type { RegionBlockEntity, RegionEntitySpawn } from './GenerationRegion';

/**
 * What Bedrock calls each Java block entity a feature or a structure attaches.
 *
 * A short table rather than a generated one, because neither edition publishes a block entity id
 * mapping. `@jsprismarine/features` names the chest, the spawner and the end gateway from
 * `structural.ts` and the bee nest from `tree.ts`; the structures add the barrel a village house
 * keeps its loot in and the trapped chest, which Bedrock stores under the same id as a chest.
 *
 * A type with no row loses its contents and keeps its block, which is what the generated chunk
 * would show for a container this server cannot name.
 */
const BEDROCK_BLOCK_ENTITY_IDS: Readonly<Record<string, string>> = {
    'minecraft:barrel': 'Barrel',
    'minecraft:beehive': 'Beehive',
    'minecraft:chest': 'Chest',
    'minecraft:end_gateway': 'EndGateway',
    'minecraft:mob_spawner': 'MobSpawner',
    'minecraft:trapped_chest': 'Chest'
};

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
 * @returns The block entity, or undefined for a Java type this server has no Bedrock name for,
 *   which leaves the block itself in place rather than the chunk unreadable.
 */
export const createBlockEntity = (placed: RegionBlockEntity, seed: bigint): BlockEntity | undefined => {
    const id = BEDROCK_BLOCK_ENTITY_IDS[placed.request.id];
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

    return { type, x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw };
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
