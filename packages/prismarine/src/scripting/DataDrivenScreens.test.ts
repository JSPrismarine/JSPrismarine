import ClientboundDataDrivenUICloseScreenPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataDrivenUICloseScreenPacket';
import ClientboundDataDrivenUIShowScreenPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataDrivenUIShowScreenPacket';
import ClientboundDataStorePacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataStorePacket';
import DataStoreUpdate, { DataStoreValueType } from '@jsprismarine/protocol/bedrock/structure/DataStoreUpdate';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { DataDrivenScreen } from '@jsprismarine/script-host/host/world';
import { describe, expect, it } from 'vitest';

import { dataDrivenScreensFor, PropertyScreens, variablesOf, VariableScreens } from './DataDrivenScreens';

/** A custom form as the script host lays one out, with a raw message, a dropdown and a close button. */
const FORM: DataDrivenScreen = {
    screenId: 'minecraft:custom_form',
    property: 'custom_form_data_1',
    instance: 1,
    value: {
        title: { rawtext: [{ text: 'A' }] },
        style_id: 'modalForm',
        closeButton: { label: 'Close', onClick: 0, visible: false, button_visible: true },
        layout: {
            '0': { text: 'label a', visible: true, label_visible: true },
            '1': {
                label: 'd',
                value: 2,
                items: { '0': { label: 'label a', value: 0, description: 'tip a' }, length: 1n },
                visible: true,
                dropdown_visible: true
            },
            length: 2n
        }
    },
    updates: [{ path: 'title', value: '{"rawtext":[{"text":"A"}]}\n' }]
};

/** The packets a set of screens sent, as plain data. */
const recorder = () => {
    const sent: NetworkPacket<unknown>[] = [];
    const data = () =>
        sent.map((packet) => {
            if (packet instanceof ClientboundDataStorePacket) return { store: packet.getPacketData() };
            if (packet instanceof ClientboundDataDrivenUIShowScreenPacket) return { show: packet.getPacketData() };
            if (packet instanceof ClientboundDataDrivenUICloseScreenPacket) return { close: packet.getPacketData() };
            return { other: packet.getName() };
        });
    return { send: (packet: NetworkPacket<unknown>) => void sent.push(packet), data, clear: () => sent.splice(0) };
};

describe('PropertyScreens', () => {
    it('sets the property, sends its updates, opens the screen and counts each path', () => {
        const { send, data } = recorder();
        const screens = new PropertyScreens(send);
        screens.show(3, FORM);
        screens.update('custom_form_data_1', { path: 'layout[1].value', value: 4 });

        const [change, raw, show, update] = data();
        expect(change).toMatchObject({
            store: {
                updates: [
                    { type: 1, change: { dataStoreName: 'minecraft', property: 'custom_form_data_1', updateCount: 1 } }
                ]
            }
        });
        expect(raw).toMatchObject({
            store: { updates: [{ type: 0, update: { path: 'title', propertyUpdateCount: 1, pathUpdateCount: 1 } }] }
        });
        expect(show).toEqual({ show: { screenId: 'minecraft:custom_form', formId: 3, dataInstanceId: 1 } });
        expect(update).toMatchObject({
            store: {
                updates: [
                    {
                        type: 0,
                        update: {
                            path: 'layout[1].value',
                            data: { type: DataStoreValueType.DOUBLE, value: 4 },
                            propertyUpdateCount: 1,
                            pathUpdateCount: 1
                        }
                    }
                ]
            }
        });
    });

    it("continues a path's count from the client's write, and clears the property when the screen closes", () => {
        const { send, data, clear } = recorder();
        const screens = new PropertyScreens(send);
        screens.show(3, FORM);
        clear();

        const write = new DataStoreUpdate(
            'minecraft',
            'custom_form_data_1',
            'layout[1].value',
            { type: DataStoreValueType.DOUBLE, value: 6 },
            1,
            1
        );
        expect(screens.written({ update: write, variableUpdate: null })).toEqual({
            property: 'custom_form_data_1',
            path: 'layout[1].value',
            value: 6
        });
        screens.update('custom_form_data_1', { path: 'layout[1].value', value: 4 });
        expect(data()[0]).toMatchObject({ store: { updates: [{ update: { pathUpdateCount: 2 } }] } });

        expect(screens.closed(3)).toBe(true);
        expect(data()[1]).toEqual({
            store: {
                updates: [
                    {
                        type: 1,
                        change: {
                            dataStoreName: 'minecraft',
                            property: 'custom_form_data_1',
                            updateCount: 2,
                            value: { type: 0 }
                        }
                    }
                ],
                variableUpdates: []
            }
        });
        expect(screens.closed(3)).toBe(false);
        expect(screens.written({ update: write, variableUpdate: null })).toBeUndefined();
    });
});

describe('VariableScreens', () => {
    it('flattens a property into the variables BDS 1.26.70.24 sends', () => {
        expect(variablesOf(FORM)).toEqual([
            ['title.__is_object', true],
            ['title', '{"rawtext":[{"text":"A"}]}\n'],
            ['style_id', 'modalForm'],
            ['top_close_button_visible', true],
            ['layout.length', 2],
            ['layout[0].text', 'label a'],
            ['layout[0].visible', true],
            ['layout[0].label_visible', true],
            ['layout[1].label', 'd'],
            ['layout[1].value', 2],
            ['layout[1].items.__is_array', true],
            ['layout[1].items', '[{"label":"label a","value":0,"description":"tip a"}]'],
            ['layout[1].visible', true],
            ['layout[1].dropdown_visible', true],
            ['closeButton.label', 'Close'],
            ['closeButton.onClick', 0],
            ['closeButton.visible', false],
            ['closeButton.button_visible', true]
        ]);
    });

    it('sets each variable, resends a changed one with a higher count, and removes them all when the screen closes', () => {
        const { send, data, clear } = recorder();
        const screens = new VariableScreens(send);
        screens.show(3, FORM);
        const [store, show] = data();
        expect(store).toMatchObject({
            store: {
                updates: [],
                variableUpdates: expect.arrayContaining([
                    {
                        type: 1,
                        change: {
                            variableName: 'minecraft.custom_form_data_1.layout[1].value',
                            updateCount: 1,
                            value: { type: DataStoreValueType.DOUBLE, value: 2 }
                        }
                    }
                ])
            }
        });
        // The raw message's update is already among the variables, so only the screen follows.
        expect(show).toEqual({ show: { screenId: 'minecraft:custom_form', formId: 3, dataInstanceId: 1 } });
        clear();

        screens.update('custom_form_data_1', { path: 'layout[1].value', value: 4 });
        expect(data()[0]).toEqual({
            store: {
                updates: [],
                variableUpdates: [
                    {
                        type: 1,
                        change: {
                            variableName: 'minecraft.custom_form_data_1.layout[1].value',
                            updateCount: 2,
                            value: { type: DataStoreValueType.DOUBLE, value: 4 }
                        }
                    }
                ]
            }
        });

        clear();
        expect(screens.closed(3)).toBe(true);
        expect(data()).toEqual([
            {
                store: {
                    updates: [],
                    variableUpdates: variablesOf(FORM).map(([path]) => ({
                        type: 2,
                        removal: { variableName: `minecraft.custom_form_data_1.${path}` }
                    }))
                }
            }
        ]);
    });

    it("takes a client's write only when its count is above the variable's", () => {
        const screens = new VariableScreens(() => {});
        screens.show(3, FORM);
        const write = (variableName: string, updateCount: number) =>
            screens.written({
                update: null,
                variableUpdate: { variableName, updateCount, data: { type: DataStoreValueType.DOUBLE, value: 6 } }
            });

        expect(write('minecraft.custom_form_data_1.layout[1].value', 1)).toBeUndefined();
        expect(write('minecraft.custom_form_data_1.layout[1].value', 2)).toEqual({
            property: 'custom_form_data_1',
            path: 'layout[1].value',
            value: 6
        });
        expect(write('minecraft.custom_form_data_1.layout[1].value', 2)).toBeUndefined();
        expect(write('custom_form_data_1.layout[1].value', 3)).toBeUndefined();
        expect(write('minecraft.custom_form_data_9.layout[1].value', 3)).toBeUndefined();
    });

    it('is the layout a client at protocol 2259 gets, and properties the one before', () => {
        expect(dataDrivenScreensFor(2259, () => {})).toBeInstanceOf(VariableScreens);
        expect(dataDrivenScreensFor(2225, () => {})).toBeInstanceOf(PropertyScreens);
        expect(dataDrivenScreensFor(2193, () => {})).toBeInstanceOf(PropertyScreens);
    });
});
