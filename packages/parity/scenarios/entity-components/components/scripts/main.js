/**
 * The `entity-components` scenario: a simulated player's and a pig's `equippable` and attribute
 * components, the slots of the player's inventory through `Container.getSlot`, the dimension and
 * effect types, `Effect.isValid` and `Player.spawnParticle`.
 *
 * A behavior pack scenario has no client, so the pack registers the GameTest `jsp:components`,
 * and the capture runs it with `/gametest run` once the pack is ready. Ticks are counted from
 * the tick the test starts. `structures/jsp/components.mcstructure` is a 3 by 3 by 3 structure of air.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { DimensionTypes, EffectTypes, EquipmentSlot, ItemStack, system, world } from '@minecraft/server';
import { register } from '@minecraft/server-gametest';

const PACK = 'components';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the test started. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** A stack as plain data, or null for none. */
const stack = (item) => (item === undefined ? null : { typeId: item.typeId, amount: item.amount });

/** An attribute component's values, or null when the entity has none. */
const attribute = (component) =>
    component === undefined
        ? null
        : {
              typeId: component.typeId,
              currentValue: component.currentValue,
              defaultValue: component.defaultValue,
              effectiveMin: component.effectiveMin,
              effectiveMax: component.effectiveMax
          };

attempt('DimensionTypes.getAll', () => DimensionTypes.getAll().map((type) => type.typeId));
attempt('DimensionTypes.get overworld', () => DimensionTypes.get('overworld')?.typeId ?? null);
attempt('DimensionTypes.get minecraft:the_end', () => DimensionTypes.get('minecraft:the_end')?.typeId ?? null);
attempt('DimensionTypes.get of an unknown type', () => DimensionTypes.get('jsp:nowhere') ?? null);
register('jsp', 'components', (test) => {
    start = system.currentTick;
    // EffectTypes refuses early execution.
    attempt('EffectTypes.get speed', () => EffectTypes.get('speed')?.getName() ?? null);
    attempt(
        'EffectTypes.get minecraft:village_hero',
        () => EffectTypes.get('minecraft:village_hero')?.getName() ?? null
    );
    attempt('EffectTypes.get of an unknown effect', () => EffectTypes.get('jsp:nothing') ?? null);
    attempt('EffectTypes.getAll', () => {
        // BDS lists them in no fixed order.
        return EffectTypes.getAll()
            .map((type) => type.getName())
            .sort();
    });
    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Tester');
    const pig = test.spawn('minecraft:pig', { x: 2, y: 2, z: 2 });
    const zombie = test.spawn('minecraft:zombie', { x: 0, y: 2, z: 2 });

    const equippable = player.getComponent('equippable');
    attempt('player getComponent equippable', () => equippable?.typeId ?? null);
    attempt('player hasComponent minecraft:equippable', () => player.hasComponent('minecraft:equippable'));
    attempt('pig getComponent equippable', () => pig.getComponent('equippable')?.typeId ?? null);
    attempt('zombie getComponent equippable', () => zombie.getComponent('equippable')?.typeId ?? null);
    attempt('getEquipment Mainhand', () => stack(equippable.getEquipment(EquipmentSlot.Mainhand)));
    attempt('setEquipment Head', () =>
        equippable.setEquipment(EquipmentSlot.Head, new ItemStack('minecraft:iron_helmet'))
    );
    attempt('getEquipment Head', () => stack(equippable.getEquipment(EquipmentSlot.Head)));
    attempt('setEquipment Offhand', () =>
        equippable.setEquipment(EquipmentSlot.Offhand, new ItemStack('minecraft:shield'))
    );
    attempt('setEquipment Mainhand', () =>
        equippable.setEquipment(EquipmentSlot.Mainhand, new ItemStack('minecraft:apple', 3))
    );
    attempt('mainhand in the inventory', () =>
        stack(player.getComponent('inventory').container.getItem(player.selectedSlotIndex))
    );
    attempt('setEquipment Chest with an apple', () =>
        equippable.setEquipment(EquipmentSlot.Chest, new ItemStack('minecraft:apple'))
    );
    attempt('getEquipment Chest', () => stack(equippable.getEquipment(EquipmentSlot.Chest)));
    attempt('setEquipment Body', () => equippable.setEquipment(EquipmentSlot.Body, new ItemStack('minecraft:apple')));
    attempt('totalArmor', () => equippable.totalArmor);
    attempt('getEquipmentSlot Head', () => {
        const slot = equippable.getEquipmentSlot(EquipmentSlot.Head);
        return { typeId: slot.typeId, amount: slot.amount, hasItem: slot.hasItem(), isValid: slot.isValid };
    });
    attempt('getEquipmentSlot Feet setItem', () => {
        const slot = equippable.getEquipmentSlot(EquipmentSlot.Feet);
        const before = slot.hasItem();
        slot.setItem(new ItemStack('minecraft:leather_boots'));
        return { before, after: stack(equippable.getEquipment(EquipmentSlot.Feet)) };
    });
    attempt('setEquipment Head with none', () => {
        equippable.setEquipment(EquipmentSlot.Head);
        return stack(equippable.getEquipment(EquipmentSlot.Head));
    });
    attempt('getEquipment of a bad slot', () => equippable.getEquipment('Pocket'));

    attempt('player health', () => attribute(player.getComponent('health')));
    attempt('player minecraft:health', () => player.getComponent('minecraft:health')?.typeId ?? null);
    attempt('player movement', () => attribute(player.getComponent('movement')));
    attempt('pig health', () => attribute(pig.getComponent('health')));
    attempt('pig movement', () => attribute(pig.getComponent('movement')));
    attempt('pig underwater_movement', () => attribute(pig.getComponent('underwater_movement')));
    attempt('zombie health', () => attribute(zombie.getComponent('health')));
    attempt('pig setCurrentValue 4', () => {
        const health = pig.getComponent('health');
        return [health.setCurrentValue(4), health.currentValue];
    });
    attempt('pig setCurrentValue past the max', () => {
        const health = pig.getComponent('health');
        return [health.setCurrentValue(50), health.currentValue];
    });
    attempt('pig setCurrentValue negative', () => {
        const health = pig.getComponent('health');
        return [health.setCurrentValue(-3), health.currentValue];
    });
    attempt('pig resetToMaxValue', () => {
        const health = pig.getComponent('health');
        health.resetToMaxValue();
        return health.currentValue;
    });
    attempt('pig resetToDefaultValue', () => {
        const health = pig.getComponent('health');
        health.setCurrentValue(3);
        health.resetToDefaultValue();
        return health.currentValue;
    });
    attempt('player setCurrentValue 7', () => {
        const health = player.getComponent('health');
        return [health.setCurrentValue(7), health.currentValue];
    });

    const container = player.getComponent('inventory').container;
    attempt('getSlot 5 of an empty slot', () => {
        const slot = container.getSlot(5);
        return { hasItem: slot.hasItem(), isValid: slot.isValid, item: stack(slot.getItem()) };
    });
    attempt('typeId of an empty slot', () => container.getSlot(5).typeId);
    attempt('amount of an empty slot', () => container.getSlot(5).amount);
    attempt('nameTag of an empty slot', () => container.getSlot(5).nameTag ?? null);
    attempt('set amount of an empty slot', () => {
        container.getSlot(5).amount = 2;
    });
    attempt('getSlot past the end', () => container.getSlot(36).hasItem());
    attempt('getSlot setItem', () => {
        const slot = container.getSlot(5);
        slot.setItem(new ItemStack('minecraft:stick', 4));
        return { typeId: slot.typeId, amount: slot.amount, item: stack(container.getItem(5)) };
    });
    attempt('slot amount set', () => {
        const slot = container.getSlot(5);
        slot.amount = 9;
        return stack(container.getItem(5));
    });
    attempt('slot amount set past the stack size', () => {
        const slot = container.getSlot(5);
        slot.amount = 70;
        return slot.amount;
    });
    attempt('slot amount set to 0', () => {
        const slot = container.getSlot(5);
        slot.amount = 0;
        return slot.amount;
    });
    attempt('slot nameTag set', () => {
        const slot = container.getSlot(5);
        slot.nameTag = 'Wand';
        return [slot.nameTag, container.getItem(5)?.nameTag ?? null];
    });
    attempt('slot nameTag set to undefined', () => {
        const slot = container.getSlot(5);
        slot.nameTag = undefined;
        return slot.nameTag ?? null;
    });
    attempt('slot setLore and getLore', () => {
        const slot = container.getSlot(5);
        slot.setLore(['one', 'two']);
        return [slot.getLore(), container.getItem(5)?.getLore() ?? null];
    });
    attempt('slot follows the container', () => {
        const slot = container.getSlot(5);
        container.setItem(5, new ItemStack('minecraft:apple'));
        return slot.typeId;
    });
    attempt('slot maxAmount and isStackable', () => {
        const slot = container.getSlot(5);
        return [slot.maxAmount, slot.isStackable];
    });
    attempt('slot setItem with none', () => {
        const slot = container.getSlot(5);
        slot.setItem();
        return slot.hasItem();
    });

    attempt('spawnParticle', () => player.spawnParticle('minecraft:basic_flame_particle', player.location));
    attempt('Effect isValid', () => {
        const effect = pig.addEffect('speed', 200);
        const before = effect.isValid;
        pig.removeEffect('speed');
        return [before, effect.isValid];
    });

    attempt('zombie resetToMinValue', () => {
        const health = zombie.getComponent('health');
        health.resetToMinValue();
        return [health.currentValue, zombie.isValid];
    });

    system.runTimeout(() => {
        attempt('pig health a tick later', () => pig.getComponent('health').currentValue);
        attempt('zombie a tick after resetToMinValue', () => zombie.isValid);
        record('removing');
        test.removeSimulatedPlayer(player);
        attempt('getEquipment after removal', () => stack(equippable.getEquipment(EquipmentSlot.Head)));
        attempt('equippable isValid after removal', () => equippable.isValid);
        pig.remove();
        if (zombie.isValid) zombie.remove();
        test.succeed();
        system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
    }, 4);
})
    .structureLocation({ x: 0, y: -60, z: 0 })
    .maxTicks(60);

record('ready for /gametest');
