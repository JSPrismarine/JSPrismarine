/**
 * The player an advancement event is about, in both directions.
 *
 * `AdvancementEngine` is written against `EntityView` from
 * `@jsprismarine/predicates` and never learns what a player is, which is
 * right: an advancement condition asks what the player is wearing and where
 * they are standing, not what class they are. But the reward hooks hand the
 * same `EntityView` back and expect the host to grant experience to it, so the
 * host needs the way home.
 *
 * A `WeakMap` keyed on the view is what provides it. Views are built fresh for
 * each raise, because a player's position changes between two of them, and the
 * map lets each one find the player it was built from without the view
 * carrying a field the predicate grammar would have to ignore.
 */
import type { EntityView } from '@jsprismarine/predicates';

import { getGametypeName } from '@jsprismarine/minecraft';
import type Server from '../Server';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { ExperienceHolder } from '../entity/Experience';
import { entityPredicateView } from '../entity/predicateView';
import type { ViewableEntity, ViewableEquipment } from '../entity/predicateView';

/**
 * What a trigger condition reads of the player an event is about, and what a reward pays into.
 */
export interface AdvancementSubjectPlayer extends ViewableEntity {
    getEquipment(): ViewableEquipment;
    getServer(): Server;
    readonly attributes: { getValue(id: string): number };
    readonly gamemode: number;
    readonly metadata: { readonly sprinting: boolean };
    getFood(): number;
    getSaturation(): number;
    isSneaking(): boolean;
    isFlying(): boolean;
    /** Where an experience reward goes. */
    getExperience(): ExperienceHolder;
}

const players = new WeakMap<EntityView, AdvancementSubjectPlayer>();

/**
 * The view one player presents to the trigger conditions.
 *
 * Built fresh each time: the position, the equipment and the food bar are all
 * read at the moment of the event, and a cached view would answer about where
 * the player was when they joined.
 */
export const advancementSubject = (player: AdvancementSubjectPlayer): EntityView => {
    const view = entityPredicateView(player, {
        equipment: player.getEquipment(),
        tags: player.getServer().getContent().tags,
        player: {
            experienceLevel: player.attributes.getValue(AttributeIds.PlayerLevel),
            gameMode: getGametypeName(player.gamemode),
            food: { level: player.getFood(), saturation: player.getSaturation() },
            sneaking: player.isSneaking(),
            sprinting: player.metadata.sprinting,
            flying: player.isFlying()
        }
    });

    players.set(view, player);
    return view;
};

/** The player a view was built from, or undefined for a view from elsewhere. */
export const playerOfSubject = (view: EntityView): AdvancementSubjectPlayer | undefined => players.get(view);
