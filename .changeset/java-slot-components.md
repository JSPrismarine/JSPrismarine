---
'@jsprismarine/protocol': minor
'@jsprismarine/errors': minor
---

Java Edition slots carry data components. `JavaItemStack` moved from `@jsprismarine/protocol/java/packet/play` to `@jsprismarine/protocol/java/packet/itemStack`, with `components` and `removed` for the patch a stack sets: its damage, names, lore, enchantments, item model, custom model data, cooldown and food among them, and the `consumable`, `tool` and `equippable` components a client predicts eating, mining and wearing from, whose codecs `@jsprismarine/protocol/java/packet/itemBehavior` holds. A client's slot skips the components it has no codec for. `ProtocolWireErrors.JavaItemComponentsUnread` is replaced by `JavaItemComponentUnread`, which names the component, and `JavaRegistryEntryUnknown` reports a component type or enchantment the release lacks.
