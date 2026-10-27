/**
 * Blocks by name, over whichever registry the server has.
 *
 * A thin adapter now rather than a registry of its own: the names come from
 * `ServerContent`'s resolved block types, and from the shipped vanilla state
 * catalog for a server that hands over no content build at all, which is a
 * test double. Either way there is one entry per block the client knows, which is the
 * change that matters - the class registry knew 260 and the palette has 1477,
 * so every other block used to come back as air.
 */
import { blockProperties } from '@jsprismarine/blocks';
import type { BlockStateValue, BlockType } from '@jsprismarine/blocks';

import type Server from '../Server';
import type { ServerContent } from '../content/ServerContent';
import Timer from '../utils/Timer';
import { Block, javaBlockFactsOf } from './Block';
import type { BlockFacts } from './Block';
import { BlockStateSchemas } from './state/BlockStateSchema';

/**
 * The part of the server the block manager uses. A test can hand in a logger
 * and a content getter without building the rest.
 */
export type BlockManagerServer = Pick<Server, 'getLogger'> & {
    getContent?(): ServerContent | undefined;
};

/**
 * The facts of one palette state, out of the content build.
 *
 * Six of the eight come from the flattened per-state table, which is the
 * point of flattening it; `requiresCorrectTool` comes from the overlay's own
 * `jsprismarine:block_properties`, which is the only place the pack grammar
 * can hold it; and `burnOdds` has no component at all in either edition, so
 * it falls through to the Java property table the overlay was generated
 * from. A pack that changes a block changes the first seven.
 */
const factsFromContent = (
    content: ServerContent,
    type: BlockType,
    states: Readonly<Record<string, BlockStateValue>>
): BlockFacts => {
    const state = type.state(states);
    const table = content.blocks.table;
    const id = state.runtimeId;

    return {
        ...javaBlockFactsOf(type.identifier, states),
        hardness: table.hardness[id]!,
        blastResistance: table.blastResistance[id]!,
        lightEmission: table.lightEmission[id]!,
        lightFilter: table.lightFilter[id]!,
        friction: table.friction[id]!,
        solid: table.solid[id] === 1,
        requiresCorrectTool: state.content.params(blockProperties)?.requiresCorrectTool ?? false
    };
};

export default class BlockManager {
    private readonly server: BlockManagerServer;

    public constructor(server: BlockManagerServer) {
        this.server = server;
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        const timer = new Timer();
        this.server.getLogger().verbose(`Serving §b${this.names().length}§r block(s) (took §e${timer.stop()} ms§r)!`);
    }

    /**
     * The content build, which a running server always has.
     *
     * Undefined only for a server double that leaves `getContent` out, and that is what the
     * fallback to the shipped state catalog below is for.
     */
    private content(): ServerContent | undefined {
        return this.server.getContent?.();
    }

    /** Every block name the server can hand out, which is the whole palette. */
    private names(): readonly string[] {
        const content = this.content();
        return content ? [...content.blocks.types.keys()] : BlockStateSchemas.names();
    }

    /**
     * Get block by namespaced ID.
     *
     * @throws When the name is not one the registry or the state catalog knows.
     */
    public getBlock(name: string, states: Readonly<Record<string, BlockStateValue>> = {}): Block {
        const block = this.findBlock(name, states);
        if (!block) {
            throw new Error(`invalid block with id ${name}`);
        }

        return block;
    }

    /**
     * Get block by namespaced ID, or `null` when nothing answers to that name.
     *
     * Names reach this from whatever a player happens to be holding or
     * looking at, so a miss is the ordinary case rather than programmer
     * error and callers that can carry on ask with this instead of catching.
     */
    public findBlock(name: string, states: Readonly<Record<string, BlockStateValue>> = {}): Block | null {
        const content = this.content();
        if (content) {
            const type = content.blocks.types.get(name);
            if (!type) return null;
            return new Block({ name, states, facts: factsFromContent(content, type, states), content });
        }

        return BlockStateSchemas.get(name) === null ? null : new Block({ name, states });
    }

    /**
     * Every block the server can hand out, one per identifier in its default state.
     *
     * Building 1477 instances per call is why the creative menu indexes the
     * result once rather than searching it.
     */
    public getBlocks(): Block[] {
        return this.names().map((name) => this.getBlock(name));
    }
}
