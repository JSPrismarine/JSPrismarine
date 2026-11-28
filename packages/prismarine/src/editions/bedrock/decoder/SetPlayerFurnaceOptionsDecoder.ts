import type SetPlayerFurnaceOptionsPacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerFurnaceOptionsPacket';
import {
    FurnaceLayout,
    FurnaceLeftTabIndex,
    FurnaceType
} from '@jsprismarine/protocol/bedrock/packet/SetPlayerFurnaceOptionsPacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent, RecipeBook } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** The recipe book of each furnace screen. `None` names no screen, so it has none. */
const BOOKS: ReadonlyMap<number, RecipeBook> = new Map([
    [FurnaceType.Furnace, 'furnace'],
    [FurnaceType.BlastFurnace, 'blastFurnace'],
    [FurnaceType.Smoker, 'smoker']
]);

/**
 * A furnace screen's layout, of which the recipe book's filter is what both editions keep. The
 * tab and the layout are Bedrock's own, so they are checked against the docs and left here.
 */
export default class SetPlayerFurnaceOptionsDecoder implements PacketDecoder<
    SetPlayerFurnaceOptionsPacket,
    'setRecipeBook'
> {
    public static readonly PacketName = 'SetPlayerFurnaceOptionsPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['setRecipeBook'] as const;

    /** Decodes the furnace's book and its filter, once the three enum fields hold values the docs list. */
    public decode(packet: SetPlayerFurnaceOptionsPacket, view: DecodeView): readonly Intent<'setRecipeBook'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.FurnaceOptionsNotDecoded();

        const { furnaceType, options } = data;
        const book = BOOKS.get(furnaceType);
        const rejection =
            FurnaceType[furnaceType] === undefined
                ? `${furnaceType} is not a furnace type`
                : FurnaceLeftTabIndex[options.leftTab] === undefined
                  ? `${options.leftTab} is not a furnace tab`
                  : FurnaceLayout[options.layout] === undefined
                    ? `${options.layout} is not a furnace layout`
                    : book === undefined
                      ? 'it names no furnace'
                      : null;
        if (rejection !== null || book === undefined) {
            view.log.verbose(`Dropped furnace options from ${view.name}: ${rejection}`);
            return [];
        }

        return [{ kind: 'setRecipeBook', book, open: null, filtering: options.filtering }];
    }
}
