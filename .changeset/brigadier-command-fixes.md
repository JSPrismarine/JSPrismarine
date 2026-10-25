---
'@jsprismarine/brigadier': minor
'@jsprismarine/prismarine': patch
---

Fix four defects in the Brigadier port and the command packet, all found against Mojang's
published command data and upstream Brigadier.

`CommandDispatcher.execute` passed the caught exception to `ResultConsumer.onCommandComplete`
where upstream passes 0, and the consumer's `result` parameter was widened to `any` to allow it.
It passes 0 now and the parameter is a `number`, so an `execute store result` sink always reads
the count rather than an `Error`.

`Command<S>` declared `(context) => Promise<any>` where upstream returns an `int` and the
dispatcher reads the value synchronously. It returns `number` now. Both are breaking: a command
body that returns a promise no longer typechecks, which is the point, because the dispatcher
never awaited one.

`AvailableCommandsPacket` writes the four chained-subcommand fields it used to send as
placeholders, which are what carries `/execute`'s subcommand chain to a Bedrock client. A
parameter can hold a `CommandChainedSubcommand` the way it holds an enum, a command declares the
tables it uses, the packet sets `CommandParameterOption.EnumAsChainedCommand` on the tail
parameter, and an overload is marked `isChaining` exactly when it ends in one, which is how
Mojang's own data has it.

`CommandArgumentType` gains the 8 parameter type ids Mojang's command set uses and the table
omitted: `WildcardSelection` 10, `PathCommand` 17, `FullIntegerRange` 23, `EquipmentSlot` 47,
`BlockStateArray` 84, `ClockTimeMarker` 86, `PoiType` 88 and `CodeBuilderArgs` 92.
