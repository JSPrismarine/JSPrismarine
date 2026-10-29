import { NetworkUtil } from '../NetworkUtil';
import type BlockPosition from '../../world/BlockPosition';
import DataPacket from './DataPacket';

/**
 * The docs' `CommandBlockMode`: how a command block fires, as the `Command Block Mode`
 * varuint32 numbers it. The command block screen calls `Normal` Impulse.
 */
export enum CommandBlockMode {
    Normal = 0,
    Repeating = 1,
    Chain = 2
}

/** What the command update applies to: a command block minecart or a placed command block. */
export type CommandBlockTarget =
    | { isBlock: false; targetRuntimeId: bigint }
    | {
          isBlock: true;
          blockPosition: BlockPosition;
          commandBlockMode: CommandBlockMode;
          redstoneMode: boolean;
          isConditional: boolean;
      };

/**
 * The contents of the command block screen when the client closes it.
 *
 * Wire layout at protocol 2193: `Target` as a `oneOf` whose varuint32 selector is the legacy
 * "Is Block?" boolean (0 for an `EntityCommandTarget`, 1 for `BlockCommandData`), so a single
 * byte either way. The entity alternative is `Target Runtime ID` as a varuint64. The block
 * alternative is `Block Position` (three ZigZag varint32), `Command Block Mode` as a varuint32,
 * `Redstone Mode` and `Is Conditional` as booleans. Then `Command`, `Last Output`, `Name`, and
 * `FilteredName` as strings, `Track Output` as a boolean, `Tick Delay` as an int32 LE, and
 * `Execute On First Tick` as a boolean.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/command-block-update-packet/
 */
export default class CommandBlockUpdatePacket extends DataPacket {
    public target: CommandBlockTarget = { isBlock: false, targetRuntimeId: 0n };
    public command = '';
    public lastOutput = '';
    public name = '';
    public filteredName = '';
    public trackOutput = false;

    /** Ticks between runs of a repeating block. */
    public tickDelay = 0;

    public executeOnFirstTick = false;

    /** Reads the target alternative and the shared fields. */
    public decodePayload(): void {
        const selector = this.readUnsignedVarInt();
        switch (selector) {
            case 0:
                this.target = { isBlock: false, targetRuntimeId: this.readUnsignedVarLong() };
                break;
            case 1:
                this.target = {
                    isBlock: true,
                    blockPosition: NetworkUtil.readBlockPosition(this),
                    commandBlockMode: this.readUnsignedVarInt(),
                    redstoneMode: this.readBoolean(),
                    isConditional: this.readBoolean()
                };
                break;
            default:
                throw new Error(`Unknown command block target alternative ${selector}`);
        }

        this.command = NetworkUtil.readString(this);
        this.lastOutput = NetworkUtil.readString(this);
        this.name = NetworkUtil.readString(this);
        this.filteredName = NetworkUtil.readString(this);
        this.trackOutput = this.readBoolean();
        this.tickDelay = this.readIntLE();
        this.executeOnFirstTick = this.readBoolean();
    }

    /** Writes the target alternative and the shared fields. */
    public encodePayload(): void {
        const { target } = this;
        this.writeUnsignedVarInt(target.isBlock ? 1 : 0);
        if (target.isBlock) {
            NetworkUtil.writeBlockPosition(this, target.blockPosition);
            this.writeUnsignedVarInt(target.commandBlockMode);
            this.writeBoolean(target.redstoneMode);
            this.writeBoolean(target.isConditional);
        } else {
            this.writeUnsignedVarLong(target.targetRuntimeId);
        }

        NetworkUtil.writeString(this, this.command);
        NetworkUtil.writeString(this, this.lastOutput);
        NetworkUtil.writeString(this, this.name);
        NetworkUtil.writeString(this, this.filteredName);
        this.writeBoolean(this.trackOutput);
        this.writeIntLE(this.tickDelay);
        this.writeBoolean(this.executeOnFirstTick);
    }
}
