import { BLOCK_FACES, behaviorFor } from '@jsprismarine/blocks';
import type { BlockFace, BlockHooks, BlockPosition, HookBlock } from '@jsprismarine/blocks';
import {
    VANILLA_BLOCK_FAMILIES,
    VoxelDimension,
    familyBehavior,
    offset,
    opposite,
    testDefinition
} from '@jsprismarine/block-behaviors';
import type { BlockStates, BlockWorld } from '@jsprismarine/block-behaviors';
import {
    bestNeighborSignal,
    blockSignalToWire,
    isRedstoneConductor,
    signalAt,
    strongSignalOf,
    wireShapeOf
} from '@jsprismarine/engine-systems';
import type { BlockRef, WireShape, WorldAccess } from '@jsprismarine/engine-systems';

/** More neighbor notices than any scenario's circuit raises, so a circuit that never settles fails. */
const MAX_NOTICES = 100_000;

/**
 * A voxel dimension wired up as a redstone circuit: its power readings come from
 * `@jsprismarine/engine-systems`, the signal model the server reads, over the dimension's own
 * blocks, and a neighbor notice runs the real block families on the blocks around it.
 *
 * The plain voxel world answers power from what a test set, which cannot show a rule that reads
 * the wrong power: a wire that counts its neighbors at full strength looks right there and stays
 * lit forever on the server. This one answers as the server does. The notice queue runs first in,
 * first out until nothing changes, which settles a circuit to the same state as the server's
 * depth-first order for every circuit the scenarios build, since none of them has a pulse or a
 * delay.
 */
export class CircuitDimension extends VoxelDimension implements BlockWorld {
    private readonly notices: BlockPosition[] = [];
    private readonly hooks = new Map<string, Partial<BlockHooks>>();
    private readonly engine: WorldAccess = {
        getBlock: (at) => this.refAt(at),
        setBlock: (at, to) => this.set(at, to.name, to.states),
        getBlockEntityData: () => undefined
    };

    /** Every dimension is this one; the circuits live in a single dimension. */
    public at(): this {
        return this;
    }

    /** Writes a block and, as the server's write does, tells its neighbors. */
    public override setBlock(
        position: BlockPosition,
        identifier: string,
        states: BlockStates = {},
        notify = true
    ): void {
        const before = this.block(position);
        super.setBlock(position, identifier, states);
        if (before.identifier === identifier) {
            // A state change is `onBlockStateChange` on the server, which the redstone family
            // answers by telling its neighbors too.
            this.notifyNeighbors(position);
            return;
        }
        if (notify) this.notifyNeighbors(position);
    }

    /** Queues a notice to the six neighbors of a position. */
    public override notifyNeighbors(position: BlockPosition): void {
        super.notifyNeighbors(position);
        this.notices.push(position);
    }

    /** Places a block as a player would: writes it, runs its `onPlace`, then settles the circuit. */
    public place(position: BlockPosition, identifier: string, states: BlockStates = {}): void {
        super.setBlock(position, identifier, states);
        this.hooksOf(identifier).onPlace?.({
            block: this.block(position),
            previous: undefined,
            placedBy: undefined,
            itemStack: undefined,
            face: undefined,
            faceLocation: undefined
        });
        this.notifyNeighbors(position);
        this.settle();
    }

    /** Removes a block and settles the circuit. */
    public remove(position: BlockPosition): void {
        this.setBlock(position, 'minecraft:air');
        this.settle();
    }

    /**
     * Runs every queued notice, and the ones they raise, until the circuit is still.
     *
     * @returns False when the circuit was still changing after {@link MAX_NOTICES} notices.
     */
    public settle(): boolean {
        for (let count = 0; count < MAX_NOTICES; count++) {
            const changed = this.notices.shift();
            if (changed === undefined) return true;
            const neighbor = this.block(changed);
            for (const face of BLOCK_FACES) this.tell(offset(changed, face), opposite(face), neighbor);
        }
        return false;
    }

    /** The redstone signal a wire at a position carries. */
    public wireStrength(position: BlockPosition): unknown {
        return this.block(position).states['redstone_signal'];
    }

    /** The power reaching a position, as the server reads it. */
    public override redstonePower(position: BlockPosition): number {
        return bestNeighborSignal(this.engine, position);
    }

    /** The power reaching a wire from everything but other wires, as the server reads it. */
    public override redstonePowerToWire(position: BlockPosition): number {
        return blockSignalToWire(this.engine, position);
    }

    /** The shape a wire at a position draws, as the server works it out. */
    public redstoneWireShape(position: BlockPosition): WireShape {
        return wireShapeOf(this.engine, position);
    }

    /** The signal a block gives the neighbor in a direction, as the server reads it. */
    public override redstoneSignal(position: BlockPosition, directionToSource: BlockFace): number {
        return signalAt(this.engine, position, directionToSource);
    }

    /** The strong signal a block gives the neighbor in a direction, as the server reads it. */
    public override redstoneDirectSignal(position: BlockPosition, directionToSource: BlockFace): number {
        return strongSignalOf(this.engine, position, directionToSource);
    }

    /** Whether a block passes redstone power on, as the server decides it. */
    public override redstoneConductor(position: BlockPosition): boolean {
        return isRedstoneConductor(this.refAt(position));
    }

    private tell(position: BlockPosition, face: BlockFace, neighbor: HookBlock): void {
        const block = this.block(position);
        this.hooksOf(block.identifier).onNeighborChanged?.({ block, face, neighbor });
    }

    private refAt(position: BlockPosition): BlockRef {
        const block = this.block(position);
        return { name: block.identifier, states: block.states };
    }

    private hooksOf(identifier: string): Partial<BlockHooks> {
        const known = this.hooks.get(identifier);
        if (known !== undefined) return known;
        const family = VANILLA_BLOCK_FAMILIES.find((candidate) => candidate.name === behaviorFor(identifier));
        const hooks =
            family === undefined
                ? {}
                : familyBehavior(family, this).create({ identifier, definition: testDefinition(identifier) });
        this.hooks.set(identifier, hooks);
        return hooks;
    }
}

/** An empty circuit. */
export const createCircuit = (): CircuitDimension => new CircuitDimension('minecraft:overworld');
