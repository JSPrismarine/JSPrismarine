/**
 * The world events of a level's entities: one loaded and one about to leave and gone, a blow
 * about to land, a melee swing that reached its target, a player's swing and its guard, a status
 * effect about to be added and added, a heal and its guard, and a change of health.
 */
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import type { StoreActor } from '../../entity/data/storeActors';
import { scriptDamageSource } from '../scriptEntityEvents';
import { entityValue, fieldsOf, itemValue, playerValue } from './values';
import type { WorldEventSource } from './worldEvents';

/** The entities of one level, as its scripts hear them. */
export const entityEvents = (server: Server, level: Level): WorldEventSource => {
    const { events } = server.getKernel();
    const here = (actor: StoreActor): boolean => actor.getWorld().getLevel() === level;
    return {
        guard: (guard) => {
            const stops = [
                events.on('entityRemove', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor)) return;
                    guard({ event: 'EntityRemoveBeforeEvent', fields: { removedEntity: entityValue(actor) } });
                }),
                events.on('entityDamage', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor) || event.isCanceled()) return;
                    const verdict = guard({
                        event: 'EntityHurtBeforeEvent',
                        fields: {
                            hurtEntity: entityValue(actor),
                            damage: event.getAmount(),
                            damageSource: { damageSource: scriptDamageSource(event.getSource()) }
                        }
                    });
                    if (verdict.veto) {
                        event.preventDefault();
                        return;
                    }
                    const { damage } = verdict.fields;
                    if (typeof damage === 'number' && damage !== event.getAmount()) {
                        if (damage <= 0) event.preventDefault();
                        else event.setAmount(damage);
                    }
                }),
                events.on('playerAttackEntity', (event) => {
                    const player = event.getPlayer();
                    if (!here(player) || event.isCanceled()) return;
                    const verdict = guard({
                        event: 'PlayerItemAttackEntityBeforeEvent',
                        fields: fieldsOf({
                            player: entityValue(player),
                            target: entityValue(event.getTarget()),
                            itemStack: itemValue(event.getItem())
                        })
                    });
                    if (verdict.veto) event.preventDefault();
                }),
                events.on('entityEffectAdd', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor) || event.isCanceled()) return;
                    const effect = event.getEffect();
                    const verdict = guard({
                        event: 'EffectAddBeforeEvent',
                        fields: {
                            entity: entityValue(actor),
                            effectType: effect.id,
                            duration: effect.durationTicks
                        }
                    });
                    if (verdict.veto) {
                        event.preventDefault();
                        return;
                    }
                    const { duration } = verdict.fields;
                    if (typeof duration === 'number' && duration !== effect.durationTicks) event.setDuration(duration);
                }),
                events.on('entityTame', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor) || event.isCanceled()) return;
                    const verdict = guard({
                        event: 'EntityTamedBeforeEvent',
                        fields: { entity: entityValue(actor), tamingEntity: entityValue(event.getTamer()) }
                    });
                    if (verdict.veto) event.preventDefault();
                }),
                events.on('entityHeal', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor) || event.isCanceled()) return;
                    const verdict = guard({
                        event: 'EntityHealBeforeEvent',
                        fields: {
                            healedEntity: entityValue(actor),
                            healing: event.getAmount(),
                            healCause: event.getCause()
                        }
                    });
                    if (verdict.veto) {
                        event.preventDefault();
                        return;
                    }
                    const { healing } = verdict.fields;
                    if (typeof healing === 'number') event.setAmount(healing);
                })
            ];
            return () => {
                for (const stop of stops) stop();
            };
        },
        events: (listener) => {
            const stops = [
                events.on('entitySpawn', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor) || event.getCause() !== 'loaded') return;
                    listener({ event: 'EntityLoadAfterEvent', fields: { entity: entityValue(actor) } });
                }),
                events.on('entityRemoved', (event) => {
                    if (event.getWorld().getLevel() !== level) return;
                    const id = String(event.getRuntimeId());
                    listener({
                        event: 'EntityRemoveAfterEvent',
                        fields: {
                            removedEntityId: id,
                            typeId: event.getType(),
                            removedEntity: { entity: { id, typeId: event.getType() } }
                        }
                    });
                }),
                events.on('entityHitEntity', (event) => {
                    const attacker = event.getAttacker();
                    if (!here(attacker)) return;
                    listener({
                        event: 'EntityHitEntityAfterEvent',
                        fields: { damagingEntity: entityValue(attacker), hitEntity: entityValue(event.getTarget()) }
                    });
                }),
                events.on('entityEffectAdded', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor)) return;
                    const { id, amplifier, durationTicks } = event.getEffect();
                    listener({
                        event: 'EffectAddAfterEvent',
                        fields: {
                            entity: entityValue(actor),
                            effect: {
                                effect: { typeId: id, amplifier, duration: durationTicks },
                                holder: String(actor.getRuntimeId())
                            }
                        }
                    });
                }),
                events.on('entityHealed', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor)) return;
                    listener({
                        event: 'EntityHealAfterEvent',
                        fields: {
                            healedEntity: entityValue(actor),
                            healing: event.getAmount(),
                            healCause: event.getCause()
                        }
                    });
                }),
                events.on('entityTrigger', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor)) return;
                    listener({
                        event: 'DataDrivenEntityTriggerAfterEvent',
                        fields: {
                            entity: entityValue(actor),
                            eventId: event.getEventId(),
                            addedComponentGroups: { json: JSON.stringify(event.getAdded()) },
                            removedComponentGroups: { json: JSON.stringify(event.getRemoved()) }
                        }
                    });
                }),
                events.on('playerNameEntity', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor)) return;
                    const previous = event.getPreviousName();
                    listener({
                        event: 'PlayerUseNameTagAfterEvent',
                        fields: fieldsOf({
                            player: playerValue(event.getPlayer()),
                            entityNamed: entityValue(actor),
                            newName: event.getNewName(),
                            previousName: previous === '' ? undefined : previous
                        })
                    });
                }),
                events.on('entityTamed', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor)) return;
                    listener({
                        event: 'EntityTamedAfterEvent',
                        fields: { entity: entityValue(actor), tamingEntity: entityValue(event.getTamer()) }
                    });
                }),
                events.on('entityHealthChanged', (event) => {
                    const actor = event.getEntity();
                    if (!here(actor)) return;
                    listener({
                        event: 'EntityHealthChangedAfterEvent',
                        fields: { entity: entityValue(actor), oldValue: event.getBefore(), newValue: event.getAfter() }
                    });
                })
            ];
            return () => {
                for (const stop of stops) stop();
            };
        }
    };
};
