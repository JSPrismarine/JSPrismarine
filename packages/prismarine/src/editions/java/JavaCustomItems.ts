/**
 * Custom items as a Java client sees them: a vanilla base item that names the item's own model,
 * with its name and the data components the client predicts from, read off the item's Bedrock
 * components. The converted resource pack draws the model from the item's icon.
 */
import type { JavaCustomItem } from '@jsprismarine/java-packs/convert';
import type { JavaEquippableSlot } from '@jsprismarine/protocol/java/packet/itemBehavior';
import type { JavaItemComponents } from '@jsprismarine/protocol/java/packet/itemStack';

import { isRecord } from '../../utils/isRecord';
import type { JavaContentAssignments, JavaItemAssignment } from './JavaContentAssignments';

/** A custom item as the content holds it: its identifier and its Bedrock components by name. */
export interface BedrockItemType {
    readonly identifier: string;
    readonly bedrockComponents: ReadonlyMap<string, unknown>;
}

/** A custom item's stacks as a Java client is sent them. */
export interface JavaCustomStack {
    /** The base item's Java id. */
    readonly base: string;
    /** The components every stack of it sets. */
    readonly components: JavaItemComponents;
}

/** A number a component gives directly or as `{ value }`. */
const numberOf = (value: unknown): number | undefined => {
    const raw = isRecord(value) ? value.value : value;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
};

/**
 * The short name of an item's icon in `item_texture.json`: the component itself, its `texture`,
 * or its `textures`' `default`.
 */
export const bedrockIconOf = (icon: unknown): string | undefined => {
    if (typeof icon === 'string') return icon;
    if (!isRecord(icon)) return undefined;
    if (typeof icon.texture === 'string') return icon.texture;
    const { textures } = icon;
    if (typeof textures === 'string') return textures;
    return isRecord(textures) && typeof textures.default === 'string' ? textures.default : undefined;
};

/** The Java slot a `minecraft:wearable` slot is. */
const WEARABLE_SLOTS: Readonly<Record<string, JavaEquippableSlot>> = {
    'slot.armor.head': 'head',
    'slot.armor.chest': 'chest',
    'slot.armor.legs': 'legs',
    'slot.armor.feet': 'feet',
    'slot.weapon.offhand': 'offhand'
};

/** How long eating takes when the item does not say, as vanilla food takes. */
const DEFAULT_EAT_SECONDS = 1.6;

/**
 * The Java components a custom item's stacks set, from its Bedrock components:
 *
 * - its model, and its name as a translation of its `minecraft:display_name`, or of
 *   `item.<identifier>.name`, the key the converted pack's lang files keep;
 * - `minecraft:max_stack_size`, and `minecraft:durability` as its maximum damage, which takes the
 *   stack size to 1, since a Java stack cannot both wear and stack;
 * - `minecraft:food` as food a player eats in `minecraft:use_modifiers`' time, with Bedrock's
 *   saturation modifier as the saturation it gives;
 * - `minecraft:cooldown` as a cooldown its category shares;
 * - `minecraft:wearable` as the slot it is worn in, drawn with no armor model.
 * @param identifier - The item's Bedrock identifier.
 * @param bedrock - Its Bedrock components.
 * @param assignment - Its base and model key.
 */
export const javaCustomItemComponentsOf = (
    identifier: string,
    bedrock: ReadonlyMap<string, unknown>,
    { model }: JavaItemAssignment
): JavaItemComponents => {
    const displayName = bedrock.get('minecraft:display_name');
    const named = isRecord(displayName) && typeof displayName.value === 'string' ? displayName.value : undefined;
    const durability = bedrock.get('minecraft:durability');
    const maxDamage = isRecord(durability) ? numberOf(durability.max_durability) : undefined;
    const stackSize = maxDamage === undefined ? numberOf(bedrock.get('minecraft:max_stack_size')) : 1;
    const food = bedrock.get('minecraft:food');
    const nutrition = isRecord(food) ? (numberOf(food.nutrition) ?? 0) : undefined;
    const useModifiers = bedrock.get('minecraft:use_modifiers');
    const eatSeconds = isRecord(useModifiers) ? numberOf(useModifiers.use_duration) : undefined;
    const cooldown = bedrock.get('minecraft:cooldown');
    const cooldownSeconds = isRecord(cooldown) ? numberOf(cooldown.duration) : undefined;
    const category = isRecord(cooldown) && typeof cooldown.category === 'string' ? cooldown.category : undefined;
    const wearable = bedrock.get('minecraft:wearable');
    const slot = isRecord(wearable) && typeof wearable.slot === 'string' ? WEARABLE_SLOTS[wearable.slot] : undefined;
    const namespace = identifier.includes(':') ? identifier.slice(0, identifier.indexOf(':')) : 'minecraft';
    return {
        'minecraft:item_model': model,
        'minecraft:item_name': { translate: named ?? `item.${identifier}.name` },
        ...(stackSize === undefined
            ? {}
            : { 'minecraft:max_stack_size': Math.max(1, Math.min(99, Math.trunc(stackSize))) }),
        ...(maxDamage === undefined || maxDamage <= 0 ? {} : { 'minecraft:max_damage': Math.trunc(maxDamage) }),
        ...(nutrition === undefined || !isRecord(food)
            ? {}
            : {
                  'minecraft:food': {
                      nutrition: Math.trunc(nutrition),
                      saturation: nutrition * (numberOf(food.saturation_modifier) ?? 0.6) * 2,
                      canAlwaysEat: food.can_always_eat === true
                  },
                  'minecraft:consumable': {
                      seconds: eatSeconds ?? DEFAULT_EAT_SECONDS,
                      animation: 'eat',
                      sound: { id: 'minecraft:entity.generic.eat' },
                      particles: true,
                      effects: []
                  }
              }),
        ...(cooldownSeconds === undefined || cooldownSeconds <= 0
            ? {}
            : {
                  'minecraft:use_cooldown': {
                      seconds: cooldownSeconds,
                      ...(category === undefined
                          ? {}
                          : { group: category.includes(':') ? category : `${namespace}:${category}` })
                  }
              }),
        ...(slot === undefined
            ? {}
            : {
                  'minecraft:equippable': {
                      slot,
                      equipSound: { id: 'minecraft:item.armor.equip_generic' },
                      dispensable: true,
                      swappable: true,
                      damageOnHurt: true,
                      equipOnInteract: false,
                      canBeSheared: false,
                      shearingSound: { id: 'minecraft:item.shears.snip' }
                  }
              })
    };
};

/**
 * The custom items of the content, each with its assignment: every item the content has that Java
 * has no item for.
 */
export class JavaCustomItems {
    private readonly stacks = new Map<string, JavaCustomStack>();
    /** Each custom item's identifier, by its model key. */
    private readonly byModel = new Map<string, string>();
    private readonly drawn: JavaCustomItem[] = [];

    /**
     * @param assignments - The assignments, which a new custom item is added to.
     * @param isJavaItem - Whether Java has an item for a Bedrock identifier, which then needs none.
     */
    public constructor(
        private readonly assignments: JavaContentAssignments,
        private readonly isJavaItem: (identifier: string) => boolean
    ) {}

    /** Reads the assignments file; call it once, before the first {@link update}. */
    public load(): Promise<void> {
        return this.assignments.load();
    }

    /**
     * Assigns every custom item the content has that has no assignment yet, writes the file when
     * any did, and keeps each one's stack and model.
     * @param types - The content's item types.
     */
    public async update(types: Iterable<BedrockItemType>): Promise<void> {
        this.stacks.clear();
        this.byModel.clear();
        this.drawn.length = 0;
        for (const { identifier, bedrockComponents } of types) {
            if (this.isJavaItem(identifier)) continue;
            const assignment = this.assignments.assignItem(identifier, bedrockComponents);
            this.stacks.set(identifier, {
                base: assignment.base,
                components: javaCustomItemComponentsOf(identifier, bedrockComponents, assignment)
            });
            this.byModel.set(assignment.model, identifier);
            const icon = bedrockIconOf(bedrockComponents.get('minecraft:icon'));
            if (icon !== undefined) this.drawn.push({ model: assignment.model, icon });
        }
        await this.assignments.save();
    }

    /** A custom item's stacks as Java sees them, or undefined for an item that is not one. */
    public stackOf(identifier: string): JavaCustomStack | undefined {
        return this.stacks.get(identifier);
    }

    /** The custom item a model key names, for a stack a Java client sends back. */
    public identifierOf(model: string): string | undefined {
        return this.byModel.get(model);
    }

    /** The models the converted pack draws, one per custom item with an icon. */
    public models(): readonly JavaCustomItem[] {
        return this.drawn;
    }
}
