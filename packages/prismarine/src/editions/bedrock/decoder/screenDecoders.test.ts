import AnvilDamagePacket from '@jsprismarine/protocol/bedrock/packet/AnvilDamagePacket';
import LabTablePacket, {
    LabTableReactionType,
    LabTableType
} from '@jsprismarine/protocol/bedrock/packet/LabTablePacket';
import PlayerToggleCrafterSlotRequestPacket from '@jsprismarine/protocol/bedrock/packet/PlayerToggleCrafterSlotRequestPacket';
import SetPlayerFurnaceOptionsPacket, {
    FurnaceLayout,
    FurnaceLeftTabIndex,
    FurnaceType
} from '@jsprismarine/protocol/bedrock/packet/SetPlayerFurnaceOptionsPacket';
import type { SetPlayerFurnaceOptions } from '@jsprismarine/protocol/bedrock/packet/SetPlayerFurnaceOptionsPacket';
import SetPlayerInventoryOptionsPacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerInventoryOptionsPacket';
import BlockPos from '@jsprismarine/protocol/bedrock/structure/BlockPos';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import AnvilDamageDecoder from './AnvilDamageDecoder';
import LabTableDecoder from './LabTableDecoder';
import PlayerToggleCrafterSlotRequestDecoder from './PlayerToggleCrafterSlotRequestDecoder';
import SetPlayerFurnaceOptionsDecoder from './SetPlayerFurnaceOptionsDecoder';
import SetPlayerInventoryOptionsDecoder from './SetPlayerInventoryOptionsDecoder';

describe("the screens' decoders", () => {
    it("decode an anvil's, a crafter's and a lab table's request with the block it names", () => {
        const { view } = decodeView();

        expect(
            new AnvilDamageDecoder().decode(new AnvilDamagePacket({ blockPosition: new BlockPos(3, 2, 2) }), view)
        ).toStrictEqual([{ kind: 'damageAnvil', position: { x: 3, y: 2, z: 2 } }]);
        expect(
            new PlayerToggleCrafterSlotRequestDecoder().decode(
                Object.assign(new PlayerToggleCrafterSlotRequestPacket(), {
                    posX: 1,
                    posY: 2,
                    posZ: 3,
                    slotIndex: 4,
                    isDisabled: true
                }),
                view
            )
        ).toStrictEqual([{ kind: 'toggleCrafterSlot', position: { x: 1, y: 2, z: 3 }, slot: 4, disabled: true }]);
        expect(
            new LabTableDecoder().decode(
                new LabTablePacket({
                    type: LabTableType.StartCombine,
                    position: new BlockPos(4, 1, 2),
                    reaction: LabTableReactionType.None
                }),
                view
            )
        ).toStrictEqual([{ kind: 'useLabTable', position: { x: 4, y: 1, z: 2 }, action: 'StartCombine' }]);
    });
});

describe('SetPlayerFurnaceOptionsDecoder', () => {
    const DEFAULT_DATA: SetPlayerFurnaceOptions = {
        furnaceType: FurnaceType.Smoker,
        options: { leftTab: FurnaceLeftTabIndex.RecipeSearch, filtering: true, layout: FurnaceLayout.Default }
    };
    const decode = (data: SetPlayerFurnaceOptions) => {
        const { view, logged } = decodeView({ name: 'Steve' });
        return {
            intents: new SetPlayerFurnaceOptionsDecoder().decode(new SetPlayerFurnaceOptionsPacket(data), view),
            logged
        };
    };

    it("decodes the furnace's recipe book and its filter", () => {
        expect(decode(DEFAULT_DATA)).toStrictEqual({
            intents: [{ kind: 'setRecipeBook', book: 'smoker', open: null, filtering: true }],
            logged: []
        });
    });

    it('drops a furnace type, a tab or a layout outside its enum, and the furnace type that names none', () => {
        // Numeric enums accept any number; the wire can carry one the docs do not list.
        const unknownFurnace: number = 7;
        const unknownTab: number = 6;
        const unknownLayout: number = -1;
        const dropped = [
            decode({ ...DEFAULT_DATA, furnaceType: unknownFurnace }),
            decode({ ...DEFAULT_DATA, options: { ...DEFAULT_DATA.options, leftTab: unknownTab } }),
            decode({ ...DEFAULT_DATA, options: { ...DEFAULT_DATA.options, layout: unknownLayout } }),
            decode({ ...DEFAULT_DATA, furnaceType: FurnaceType.None })
        ];

        expect(dropped.map(({ intents }) => intents)).toEqual([[], [], [], []]);
        expect(dropped.flatMap(({ logged }) => logged)).toEqual([
            'Dropped furnace options from Steve: 7 is not a furnace type',
            'Dropped furnace options from Steve: 6 is not a furnace tab',
            'Dropped furnace options from Steve: -1 is not a furnace layout',
            'Dropped furnace options from Steve: it names no furnace'
        ]);
    });
});

describe('SetPlayerInventoryOptionsDecoder', () => {
    it("decodes the crafting recipe book's filter", () => {
        const { view } = decodeView();

        expect(
            new SetPlayerInventoryOptionsDecoder().decode(
                Object.assign(new SetPlayerInventoryOptionsPacket(), { filtering: true }),
                view
            )
        ).toStrictEqual([{ kind: 'setRecipeBook', book: 'crafting', open: null, filtering: true }]);
    });
});
