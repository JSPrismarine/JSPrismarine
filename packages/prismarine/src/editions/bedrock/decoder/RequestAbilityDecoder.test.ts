import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import RequestAbilityPacket, {
    RequestAbilityValueType
} from '@jsprismarine/protocol/bedrock/packet/RequestAbilityPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import RequestAbilityDecoder from './RequestAbilityDecoder';

const request = (ability: number, valueType: number, value: boolean | number) =>
    Object.assign(new RequestAbilityPacket(), {
        ability,
        valueType,
        ...(typeof value === 'boolean' ? { boolValue: value } : { floatValue: value })
    });

describe('RequestAbilityDecoder', () => {
    it('names the ability and keeps a boolean value', () => {
        const { view } = decodeView();

        expect(
            new RequestAbilityDecoder().decode(
                request(AbilityLayerFlag.FLYING, RequestAbilityValueType.Bool, true),
                view
            )
        ).toStrictEqual([{ kind: 'requestAbility', ability: 'FLYING', value: true }]);
    });

    it('keeps a float value as a number, so a float-typed flying request is not a toggle', () => {
        const { view } = decodeView();

        expect(
            new RequestAbilityDecoder().decode(
                request(AbilityLayerFlag.FLY_SPEED, RequestAbilityValueType.Float, 0.5),
                view
            )
        ).toStrictEqual([{ kind: 'requestAbility', ability: 'FLY_SPEED', value: 0.5 }]);
    });

    it('names an unknown flag by its number and an unknown value type as no value', () => {
        const { view } = decodeView();

        expect(new RequestAbilityDecoder().decode(request(999, 7, true), view)).toStrictEqual([
            { kind: 'requestAbility', ability: '999', value: null }
        ]);
    });
});
