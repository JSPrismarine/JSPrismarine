/**
 * The `item-members` scenario: what an item stack answers about its type, what it can break and
 * be placed on, its lock and its components, and the item type, enchantment and potion
 * registries. None of it needs the world, so everything runs once after `worldLoad`.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import {
    EnchantmentType,
    EnchantmentTypes,
    ItemLockMode,
    ItemStack,
    ItemTypes,
    Potions,
    system,
    world
} from '@minecraft/server';

const PACK = 'members';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

// BDS frees an item stack no variable holds, and its components then throw, so every stack a
// component is read from stays in a variable.

/** An enchantment list as plain data. */
const enchantments = (list) => list.map(({ type, level }) => [type.id, level]);

world.afterEvents.worldLoad.subscribe(() => {
    const sword = new ItemStack('minecraft:diamond_sword');
    const apple = new ItemStack('minecraft:apple', 3);
    attempt('localizationKey', () => [sword.localizationKey, apple.localizationKey]);
    attempt('maxAmount isStackable weight', () => [
        [sword.maxAmount, sword.isStackable, sword.weight],
        [apple.maxAmount, apple.isStackable, apple.weight],
        [new ItemStack('minecraft:ender_pearl').maxAmount, new ItemStack('minecraft:ender_pearl').weight]
    ]);
    attempt('type', () => [sword.type.id, sword.type.localizationKey]);
    attempt('getTags', () => sword.getTags().sort());
    attempt('hasTag', () => [
        sword.hasTag('minecraft:is_sword'),
        sword.hasTag('is_sword'),
        apple.hasTag('minecraft:is_food')
    ]);
    attempt('matches', () => [
        apple.matches('minecraft:apple'),
        apple.matches('apple'),
        apple.matches('minecraft:bread'),
        apple.matches('minecraft:apple', {})
    ]);
    attempt('keepOnDeath lockMode', () => [apple.keepOnDeath, apple.lockMode]);
    attempt('set keepOnDeath lockMode', () => {
        apple.keepOnDeath = true;
        apple.lockMode = ItemLockMode.slot;
        return [apple.keepOnDeath, apple.lockMode];
    });
    attempt('getCanDestroy getCanPlaceOn', () => [apple.getCanDestroy(), apple.getCanPlaceOn()]);
    attempt('setCanDestroy', () => {
        apple.setCanDestroy(['minecraft:glass', 'obsidian']);
        return apple.getCanDestroy();
    });
    attempt('setCanDestroy unknown', () => apple.setCanDestroy(['minecraft:jsp_no_such_block']));
    attempt('setCanPlaceOn', () => {
        apple.setCanPlaceOn(['minecraft:grass_block']);
        return apple.getCanPlaceOn();
    });
    attempt('setCanPlaceOn nothing', () => {
        apple.setCanPlaceOn();
        return apple.getCanPlaceOn();
    });
    attempt('getRawLore', () => {
        apple.setLore(['first', 'second']);
        return apple.getRawLore();
    });
    attempt('clone', () => {
        const copy = apple.clone();
        copy.amount = 1;
        return [
            copy !== apple,
            copy.typeId,
            copy.amount,
            apple.amount,
            copy.getLore(),
            copy.keepOnDeath,
            copy.lockMode,
            copy.getCanDestroy()
        ];
    });
    attempt('isStackableWith', () => {
        const plain = new ItemStack('minecraft:apple', 5);
        const other = new ItemStack('minecraft:apple', 1);
        const named = new ItemStack('minecraft:apple', 1);
        named.nameTag = 'Named';
        return [
            plain.isStackableWith(other),
            plain.isStackableWith(named),
            plain.isStackableWith(apple),
            plain.isStackableWith(new ItemStack('minecraft:bread')),
            sword.isStackableWith(new ItemStack('minecraft:diamond_sword'))
        ];
    });
    attempt('getComponents', () => [
        sword
            .getComponents()
            .map((component) => component.typeId)
            .sort(),
        apple
            .getComponents()
            .map((component) => component.typeId)
            .sort()
    ]);
    attempt('hasComponent', () => [
        sword.hasComponent('enchantable'),
        apple.hasComponent('minecraft:food'),
        apple.hasComponent('durability')
    ]);

    attempt('food', () => {
        const food = apple.getComponent('minecraft:food');
        return [food.typeId, food.nutrition, food.saturationModifier, food.canAlwaysEat, food.usingConvertsTo];
    });
    attempt('bread food', () => new ItemStack('minecraft:bread').getComponent('minecraft:food') === undefined);
    attempt('compostable', () => apple.getComponent('minecraft:compostable').compostingChance);
    const pearl = new ItemStack('minecraft:ender_pearl');
    attempt('cooldown', () => {
        const cooldown = pearl.getComponent('minecraft:cooldown');
        return [
            cooldown.cooldownCategory,
            cooldown.cooldownTicks,
            cooldown.isCooldownCategory('minecraft:ender_pearl'),
            cooldown.isCooldownCategory('ender_pearl')
        ];
    });
    attempt('durability extras', () => {
        const durability = sword.getComponent('minecraft:durability');
        return [durability.unbreakable, durability.getDamageChance(), durability.getDamageChance(3)];
    });
    attempt('getDamageChanceRange', () => sword.getComponent('minecraft:durability').getDamageChanceRange());
    attempt('unbreakable on the stack', () => {
        const pick = new ItemStack('minecraft:iron_pickaxe');
        pick.getComponent('minecraft:durability').unbreakable = true;
        const copy = pick.clone();
        return [
            pick.getComponent('minecraft:durability').unbreakable,
            copy.getComponent('minecraft:durability').unbreakable
        ];
    });
    attempt('set unbreakable', () => {
        const durability = sword.getComponent('minecraft:durability');
        durability.unbreakable = true;
        return sword.getComponent('minecraft:durability').unbreakable;
    });
    const helmet = new ItemStack('minecraft:leather_helmet');
    attempt('dyeable of a helmet', () => helmet.getComponent('minecraft:dyeable') === undefined);

    const enchantable = sword.getComponent('minecraft:enchantable');
    attempt('enchantable slots', () => enchantable.slots.map((slot) => String(slot)));
    attempt('getEnchantments empty', () => enchantable.getEnchantments());
    attempt('addEnchantment', () => {
        enchantable.addEnchantment({ type: new EnchantmentType('sharpness'), level: 3 });
        return enchantments(enchantable.getEnchantments());
    });
    attempt('addEnchantment by registry', () => {
        enchantable.addEnchantment({ type: EnchantmentTypes.get('unbreaking'), level: 1 });
        return enchantments(enchantable.getEnchantments());
    });
    attempt('getEnchantment', () => {
        const found = enchantable.getEnchantment('sharpness');
        return [
            found?.type.id,
            found?.level,
            enchantable.getEnchantment('minecraft:sharpness')?.level ?? null,
            enchantable.getEnchantment('looting') ?? null
        ];
    });
    attempt('hasEnchantment', () => [
        enchantable.hasEnchantment('sharpness'),
        enchantable.hasEnchantment('looting'),
        enchantable.hasEnchantment(new EnchantmentType('unbreaking'))
    ]);
    attempt('addEnchantment a level too high', () =>
        enchantable.addEnchantment({ type: new EnchantmentType('looting'), level: 9 })
    );
    attempt('addEnchantment level 0', () =>
        enchantable.addEnchantment({ type: new EnchantmentType('looting'), level: 0 })
    );
    attempt('addEnchantment wrong item', () =>
        enchantable.addEnchantment({ type: new EnchantmentType('efficiency'), level: 1 })
    );
    attempt('addEnchantment conflicting', () =>
        enchantable.addEnchantment({ type: new EnchantmentType('smite'), level: 1 })
    );
    attempt('addEnchantment again', () => {
        enchantable.addEnchantment({ type: new EnchantmentType('sharpness'), level: 5 });
        return enchantments(enchantable.getEnchantments());
    });
    attempt('canAddEnchantment', () =>
        enchantable.canAddEnchantment({ type: new EnchantmentType('fire_aspect'), level: 1 })
    );
    attempt('canAddEnchantment wrong item', () =>
        enchantable.canAddEnchantment({ type: new EnchantmentType('efficiency'), level: 1 })
    );
    attempt('canAddEnchantment one it has', () =>
        enchantable.canAddEnchantment({ type: new EnchantmentType('sharpness'), level: 1 })
    );
    attempt('canAddEnchantment one it has at 0', () =>
        enchantable.canAddEnchantment({ type: new EnchantmentType('unbreaking'), level: 0 })
    );
    attempt('canAddEnchantment one it has, adding up', () =>
        enchantable.canAddEnchantment({ type: new EnchantmentType('unbreaking'), level: 2 })
    );
    attempt('addEnchantment one it has, adding up', () => {
        enchantable.addEnchantment({ type: new EnchantmentType('unbreaking'), level: 2 });
        return enchantments(enchantable.getEnchantments());
    });
    attempt('canAddEnchantment conflicting', () =>
        enchantable.canAddEnchantment({ type: new EnchantmentType('smite'), level: 1 })
    );
    attempt('canAddEnchantment too high', () =>
        enchantable.canAddEnchantment({ type: new EnchantmentType('looting'), level: 9 })
    );
    attempt('addEnchantments', () => {
        enchantable.addEnchantments([
            { type: new EnchantmentType('looting'), level: 2 },
            { type: new EnchantmentType('mending'), level: 1 }
        ]);
        return enchantments(enchantable.getEnchantments());
    });
    attempt('removeEnchantment', () => {
        enchantable.removeEnchantment('looting');
        enchantable.removeEnchantment('fire_aspect');
        return enchantments(enchantable.getEnchantments());
    });
    attempt('enchantments on the stack', () =>
        enchantments(sword.getComponent('minecraft:enchantable').getEnchantments())
    );
    attempt('isStackableWith enchanted', () => sword.isStackableWith(new ItemStack('minecraft:diamond_sword')));
    attempt('removeAllEnchantments', () => {
        enchantable.removeAllEnchantments();
        return enchantable.getEnchantments();
    });
    const enchantedBook = new ItemStack('minecraft:enchanted_book');
    attempt('enchantable of a book', () => {
        const book = enchantedBook.getComponent('minecraft:enchantable');
        return book === undefined ? null : book.slots.map((slot) => String(slot));
    });
    const plainBook = new ItemStack('minecraft:book');
    attempt('enchantable of a plain book', () => plainBook.getComponent('minecraft:enchantable') === undefined);

    attempt('EnchantmentType', () => {
        const type = new EnchantmentType('sharpness');
        return [type.id, type.maxLevel];
    });
    attempt('EnchantmentType with a namespace', () => new EnchantmentType('minecraft:sharpness').id);
    attempt('EnchantmentType unknown', () => new EnchantmentType('jsp_no_such_enchantment').id);
    attempt('EnchantmentTypes.get', () => [
        EnchantmentTypes.get('sharpness')?.id,
        EnchantmentTypes.get('minecraft:sharpness')?.id ?? null,
        EnchantmentTypes.get('jsp_none') ?? null
    ]);
    attempt('EnchantmentTypes.getAll', () => {
        // BDS lists only some of its enchantments here, by no rule a scenario has found, so the
        // record keeps to what every list it gave held.
        const all = EnchantmentTypes.getAll();
        return all.some((type) => type.id === 'sharpness');
    });
    attempt(
        'EnchantmentTypes.get the same object',
        () => EnchantmentTypes.get('sharpness') === EnchantmentTypes.get('sharpness')
    );

    attempt('ItemTypes.get', () => [
        ItemTypes.get('minecraft:apple')?.id,
        ItemTypes.get('apple')?.id ?? null,
        ItemTypes.get('minecraft:jsp_none') ?? null
    ]);
    attempt('ItemTypes.getAll', () => {
        const all = ItemTypes.getAll();
        return [all.length > 1000, all.some((type) => type.id === 'minecraft:apple')];
    });
    attempt('ItemType localizationKey', () => [
        ItemTypes.get('minecraft:apple').localizationKey,
        ItemTypes.get('minecraft:stone').localizationKey
    ]);

    attempt('Potions.getAllEffectTypes', () =>
        Potions.getAllEffectTypes()
            .slice(0, 4)
            .map((type) => [type.id, type.durationTicks ?? null])
    );
    attempt('Potions.getAllDeliveryTypes', () => Potions.getAllDeliveryTypes().map((type) => type.id));
    attempt('Potions.getEffectType', () => {
        const type = Potions.getEffectType('minecraft:swiftness');
        return [
            type?.id ?? null,
            type?.durationTicks ?? null,
            Potions.getEffectType('swiftness')?.id ?? null,
            Potions.getEffectType('minecraft:jsp') ?? null
        ];
    });
    attempt('Potions.getDeliveryType', () => [
        Potions.getDeliveryType('Consume')?.id ?? null,
        Potions.getDeliveryType('consume') ?? null
    ]);
    attempt('Potions.resolve', () => {
        const stack = Potions.resolve('minecraft:swiftness', 'ThrownSplash');
        const potion = stack.getComponent('minecraft:potion');
        return [stack.typeId, stack.amount, potion.potionEffectType.id, potion.potionDeliveryType.id];
    });
    const healing = Potions.resolve(Potions.getEffectType('minecraft:healing'), Potions.getDeliveryType('Consume'));
    attempt('Potions.resolve by type objects', () => [
        healing.typeId,
        healing.getComponent('minecraft:potion').potionEffectType.id
    ]);
    const lingering = Potions.resolve('minecraft:long_swiftness', 'ThrownLingering');
    attempt('Potions.resolve lingering', () => {
        const potion = lingering.getComponent('minecraft:potion');
        return [
            lingering.typeId,
            potion.potionEffectType.id,
            potion.potionEffectType.durationTicks ?? null,
            potion.potionDeliveryType.id
        ];
    });
    attempt('Potions.resolve unknown effect', () => Potions.resolve('minecraft:jsp', 'Consume'));
    attempt('Potions.resolve unknown delivery', () => Potions.resolve('minecraft:swiftness', 'jsp'));
    const water = new ItemStack('minecraft:potion');
    attempt('a plain potion', () => {
        const potion = water.getComponent('minecraft:potion');
        return [potion.potionEffectType.id, potion.potionDeliveryType.id];
    });
    attempt('resolved potions stack', () =>
        Potions.resolve('minecraft:swiftness', 'Consume').isStackableWith(
            Potions.resolve('minecraft:healing', 'Consume')
        )
    );

    const writable = new ItemStack('minecraft:writable_book');
    attempt('book', () => {
        const book = writable.getComponent('minecraft:book');
        return [book.pageCount, book.contents, book.isSigned, book.title ?? null, book.author ?? null];
    });
    attempt('book pages', () => {
        const stack = new ItemStack('minecraft:writable_book');
        const book = stack.getComponent('minecraft:book');
        book.setContents(['one', 'two']);
        book.insertPage(1, 'between');
        book.setPageContent(0, 'first');
        const read = [book.pageCount, book.contents, book.getPageContent(1), book.getPageContent(9) ?? null];
        book.removePage(2);
        return [...read, book.contents, book.rawContents, book.getRawPageContent(0)];
    });
    const far = new ItemStack('minecraft:writable_book');
    attempt('book page out of range', () => {
        const book = far.getComponent('minecraft:book');
        book.setPageContent(3, 'far');
        return book.contents;
    });
    attempt('book raw text', () => {
        const book = far.getComponent('minecraft:book');
        book.setPageContent(0, { rawtext: [{ text: 'raw' }] });
        return [book.contents, book.rawContents, book.getRawPageContent(0) ?? null, book.getPageContent(0) ?? null];
    });
    attempt('book removePage out of range', () => far.getComponent('minecraft:book').removePage(20));
    attempt('book insertPage out of range', () => far.getComponent('minecraft:book').insertPage(20, 'x'));
    attempt('signBook', () => {
        const stack = new ItemStack('minecraft:writable_book');
        const book = stack.getComponent('minecraft:book');
        book.setContents(['text']);
        book.signBook('Title', 'Author');
        const signed = stack.getComponent('minecraft:book');
        return [stack.typeId, signed.isSigned, signed.title, signed.author, signed.contents];
    });

    attempt('block dynamic properties', () => {
        const chest = new ItemStack('minecraft:chest');
        const properties = chest.getComponent('minecraft:block_actor_dynamic_properties');
        if (properties === undefined) return null;
        const counts = [properties.totalByteCount()];
        properties.set('jsp:a', 5);
        counts.push(properties.totalByteCount());
        properties.set('jsp:b', 'text');
        counts.push(properties.totalByteCount());
        properties.set('jsp:longer_name', true);
        counts.push(properties.totalByteCount());
        properties.set('jsp:v', { x: 1, y: 2, z: 3 });
        counts.push(properties.totalByteCount());
        properties.set('jsp:a', undefined);
        counts.push(properties.totalByteCount());
        return [counts, properties.get('jsp:b'), properties.get('jsp:a') ?? null];
    });
    record('items done');
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
