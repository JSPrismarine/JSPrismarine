import { allBlocks } from './Blocks';

import type Server from '../Server';
import BlockRegisterEvent from '../events/block/BlockRegisterEvent';
import Timer from '../utils/Timer';
import type { Block } from './Block';
import { BlockStateSchemas } from './state/BlockStateSchema';

export default class BlockManager {
    private readonly server: Server;
    private readonly blocks = new Map();
    private readonly javaBlocks = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        await this.importBlocks();
        this.reportBlocksWithoutSchema();
    }

    /**
     * Names every registered block the state catalogue does not know about.
     *
     * Bedrock renames blocks between versions - `grass` became `grass_block`, `bricks`
     * became `brick_block` - and a registered block whose name no longer exists cannot be
     * given a runtime id. Without this the first such block only surfaces when a chunk
     * containing it is generated, one crash at a time; here the whole list arrives at
     * startup, which is what makes a client version bump a five minute job.
     */
    private reportBlocksWithoutSchema(): void {
        const unknown = this.getBlocks()
            .map((block) => block.getStateName())
            .filter((name) => BlockStateSchemas.get(name) === null)
            .sort();

        if (unknown.length === 0) return;

        this.server
            .getLogger()
            .error(
                `${unknown.length} registered block(s) have no state schema and cannot be placed: ${unknown.join(', ')}. ` +
                    'They were probably renamed by a Minecraft update; the current names are in block/state/vanilla-block-schemas.json.'
            );
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.blocks.clear();
    }

    /**
     * Get block by namespaced ID.
     */
    public getBlock(name: string): Block {
        const block = this.findBlock(name);
        if (!block) {
            throw new Error(`invalid block with id ${name}`);
        }

        return block;
    }

    /**
     * Get block by namespaced ID, or `null` when nothing is registered under that name.
     *
     * The state catalogue knows every block, but only those with a class of their own are
     * registered here, and names reach this from whatever a player happens to be holding or
     * looking at. A miss is the ordinary case rather than programmer error, so callers that
     * can carry on without the block ask with this instead of catching.
     */
    public findBlock(name: string): Block | null {
        return (this.blocks.get(name) ?? this.javaBlocks.get(name) ?? null) as Block | null;
    }

    /**
     * Get block by numeric ID.
     */
    public getBlockById(id: number): Block {
        const block = this.getBlocks().find((a) => a.getId() === id && a.meta === 0);
        if (!block) {
            throw new Error(`invalid block with numeric id ${id}`);
        }

        return block;
    }

    /**
     * Get block by numeric id and meta value.
     */
    public getBlockByIdAndMeta(id: number, meta: number): Block | null {
        const block = this.getBlocks().find((a) => a.id === id && a.meta === meta);
        return block || null;
    }

    /**
     * Get all blocks.
     *
     * @returns all registered blocks.
     */
    public getBlocks(): Block[] {
        return Array.from(this.blocks.values()) as Block[];
    }

    /**
     * Register a block.
     *
     * @param block - The block
     */
    public async registerBlock(block: Block) {
        if (this.blocks.get(block.name) || this.getBlockByIdAndMeta(block.getId(), block.getMeta()))
            throw new Error(`Block with id ${block.getName()} (${block.getId()}:${block.getMeta()}) already exists`);

        const event = new BlockRegisterEvent(block);
        await this.server.emit('blockRegister', event);
        if (event.isCancelled()) return;

        this.server.getLogger().debug(`Block with id §b${block.name}§r registered`);
        this.blocks.set(block.name, block);
        this.javaBlocks.set(block.javaName, block);
    }

    /**
     * Register blocks exported by './Blocks'
     */
    private async importBlocks() {
        const timer = new Timer();

        // Dynamically register blocks
        await Promise.all(allBlocks().map(async (block) => this.registerBlock(new block())));

        this.server.getLogger().verbose(`Registered §b${this.blocks.size}§r block(s) (took §e${timer.stop()} ms§r)!`);
    }
}
