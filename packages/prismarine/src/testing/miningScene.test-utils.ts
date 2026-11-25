import type { Gametype } from '@jsprismarine/minecraft';
import type { Vector3 } from '@jsprismarine/math';
import type { Logger } from '@jsprismarine/logger';
import { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';

import type { Block } from '../block/Block';
import type { EntityRuntime } from '../entity/data/EntityRuntime';
import type { LiveEntityRuntime } from '../entity/data/live';
import { PlayerComponents } from '../entity/playerComponents';
import type { StatusEffect } from '../entity/StatusEffect';
import type HumanInventory from '../inventory/HumanInventory';
import { Item } from '../item/Item';
import type PlayerSession from '../player/PlayerSession';
import type { BlockMining } from '../world/BlockMining';
import { blockMiningOf } from '../world/BlockMining';
import BlockPosition from '../world/BlockPosition';
import type Chunk from '../world/chunk/Chunk';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { stubPlayerPort } from './playerPort.test.helper';
import { identityNamed } from './sessionIdentity.test.helper';
import { stub } from './stub.test.helper';

/** The player's runtime id. */
export const SELF = 7n;

/** What the player holds, so a test can see the break time is read for it. */
export const PICKAXE = new Item({ name: 'minecraft:iron_pickaxe' });

/**
 * A player at the origin, with runtime id 7 and a pickaxe in hand, and a world that records
 * every block it was asked to touch.
 *
 * The world generates nothing, so a position the handler should have refused shows up here
 * as a call that was made rather than as terrain that appeared. Every log line is kept too,
 * so an action the handler should have taken quietly shows up as a line.
 */
export const miningScene = (
    gamemode: Gametype,
    { serverAuthoritativeBreaking = false, chunksLoaded = true, breakSeconds = 1 } = {}
) => {
    const broken: BlockPosition[] = [];
    const hit: BlockPosition[] = [];
    /** Whom each hit named as its striker, who is left out of the sound. */
    const strikers: Array<Parameters<World['hitBlock']>[2]> = [];
    const resent: BlockPosition[] = [];
    const sprinting: boolean[] = [];
    const flying: boolean[] = [];
    const logged: string[] = [];
    /** Cracking calls in order, as `start x,y,z (previous)`, `stop x,y,z` and `event x,y,z`. */
    const cracking: string[] = [];
    /** The tool each crack animation was started for. */
    const tools: Array<Item | null> = [];
    /** What the client reported that the store player keeps: the block it mines, the sneak, the sleep and the jumps. */
    const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
    const jumps: number[] = [];
    const state = {
        get mining(): BlockMining | null {
            const held = components.get('mining.block');
            return blockMiningOf(held);
        }
    };
    /**
     * The server's tick and the client's input count, which a test moves on to stand in for time
     * spent mining.
     */
    const clock = { tick: 0, inputs: 0 };
    /** The runtime id of what stands at every position; mining records 1. */
    const standing = { runtimeId: 1 };
    const effects: StatusEffect[] = [];
    const at = (where: Vector3) => `${where.getX()},${where.getY()},${where.getZ()}`;

    const world = stub<World>({
        breakBlock: (where: Vector3) => {
            broken.push(BlockPosition.fromVector3(where));
            return true;
        },
        hitBlock: (where: Vector3, _face: number, striker?: Parameters<World['hitBlock']>[2]) => {
            hit.push(BlockPosition.fromVector3(where));
            strikers.push(striker);
        },
        resendBlock: (x, y, z) => void resent.push(new BlockPosition(x, y, z)),
        // Every chunk near the player is loaded unless the test says otherwise, and every
        // block in it is stone.
        getLoadedChunk: () => (chunksLoaded ? stub<Chunk>({}) : null),
        loadedBlockAt: () => ({ name: 'minecraft:stone', states: {} }),
        loadedBlockRuntimeIdAt: () => standing.runtimeId,
        loadedBlock: () => stub<Block>({ getBreakTicks: () => Math.ceil(breakSeconds * 20) }),
        sendWorldEvent: (where: Vector3 | null) => {
            if (where) cracking.push(`event ${at(where)}`);
        },
        startBlockCracking: (
            where: Vector3,
            face: number,
            tool: Item | null,
            previous: BlockMining | null,
            input?: number
        ) => {
            cracking.push(`start ${at(where)} (${previous === null ? 'none' : at(previous.position)})`);
            tools.push(tool);
            const breakTicks = Math.ceil(breakSeconds * 20);
            // As the world does: mining continued on the same block keeps the tick it began on.
            const continued = previous !== null && previous.position.equals(where);
            const startedAt = continued ? previous.startedAt : clock.tick;
            const startedAtInput = continued ? previous.startedAtInput : input;
            return {
                position: where,
                face,
                runtimeId: 1,
                progressPerTick: 5461,
                breakTicks,
                startedAt,
                startedAtInput
            };
        },
        stopBlockCracking: (where: Vector3) => {
            cracking.push(`stop ${at(where)}`);
        }
    });

    const player = stubPlayerPort({
        gamemode,
        getPosition: () => new Position(0, 0, 0, world),
        getInventory: () => stub<HumanInventory>({ equipment: () => PICKAXE }),
        getComponents: () => components,
        getStatusEffects: () => effects
    });
    // The runtime's answer for a player in no store: each input lands on the components.
    const inputs = stub<EntityRuntime>({
        setPlayerMining: (_player, mining) => components.set('mining.block', mining),
        setPlayerSneaking: (_player, sneaking) => components.set('movement.sneaking', sneaking),
        playerJumped: () => void jumps.push(1)
    });
    Object.assign(world, { dataEntities: () => stub<LiveEntityRuntime>({ runtime: inputs }) });

    const logger = stub<Logger>({
        debug: (...message) => void logged.push(message[0] ?? ''),
        verbose: (...message) => void logged.push(message[0] ?? '')
    });

    return {
        broken,
        hit,
        strikers,
        resent,
        sprinting,
        flying,
        logged,
        cracking,
        tools,
        state,
        clock,
        standing,
        effects,
        player,
        log: logger,
        config: { getServerAuthoritativeBlockBreaking: () => serverAuthoritativeBreaking },
        components,
        jumps,
        session: stub<PlayerSession>({
            runtimeId: SELF,
            identity: identityNamed('tester'),
            getPlayer: () => player,
            getWorld: () => world,
            inputs: () => inputs,
            handledInputs: () => clock.inputs,
            setSprinting: async (value: boolean) => {
                sprinting.push(value);
            },
            setFlying: async (value: boolean) => {
                flying.push(value);
            }
        })
    };
};

/** A {@link miningScene}. */
export type MiningScene = ReturnType<typeof miningScene>;
