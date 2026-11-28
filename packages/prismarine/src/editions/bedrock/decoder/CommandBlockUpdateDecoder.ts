import type CommandBlockUpdatePacket from '@jsprismarine/protocol/bedrock/packet/CommandBlockUpdatePacket';
import { CommandBlockMode } from '@jsprismarine/protocol/bedrock/packet/CommandBlockUpdatePacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { CommandBlockModeName, Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** The screen's mode, in the behavior family's words. */
const MODES: Readonly<Record<CommandBlockMode, CommandBlockModeName>> = {
    [CommandBlockMode.Normal]: 'impulse',
    [CommandBlockMode.Repeating]: 'repeat',
    [CommandBlockMode.Chain]: 'chain'
};

/**
 * A player's edit of a command block or a command block minecart, sent when they close its
 * screen. A Bedrock client sends every option the block keeps, its name and tick delay included.
 */
export default class CommandBlockUpdateDecoder implements PacketDecoder<
    CommandBlockUpdatePacket,
    'editCommandBlock' | 'editCommandMinecart'
> {
    public static readonly PacketName = 'CommandBlockUpdatePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['editCommandBlock', 'editCommandMinecart'] as const;

    /** Decodes the block's or the cart's edit. */
    public decode(
        packet: CommandBlockUpdatePacket,
        _view: DecodeView
    ): readonly Intent<'editCommandBlock' | 'editCommandMinecart'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.CommandBlockUpdateNotDecoded();
        const { target } = data;
        if (!target.isBlock) {
            return [
                {
                    kind: 'editCommandMinecart',
                    target: target.targetRuntimeId,
                    command: data.command,
                    trackOutput: data.trackOutput,
                    customName: data.name
                }
            ];
        }

        const { x, y, z } = target.blockPosition;
        return [
            {
                kind: 'editCommandBlock',
                position: { x, y, z },
                mode: MODES[target.commandBlockMode] ?? 'impulse',
                conditional: target.isConditional,
                needsRedstone: target.redstoneMode,
                command: data.command,
                trackOutput: data.trackOutput,
                customName: data.name,
                tickDelay: data.tickDelay,
                executeOnFirstTick: data.executeOnFirstTick
            }
        ];
    }
}
