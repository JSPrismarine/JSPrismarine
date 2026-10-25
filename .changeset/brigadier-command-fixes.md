---
'@jsprismarine/brigadier': minor
'@jsprismarine/prismarine': minor
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

Every command under `packages/prismarine/src/command/` was an `async` body, which the narrowed
`Command<S>` no longer accepts and which the dispatcher never awaited anyway. A body that has
work to await is now wrapped in `asyncCommand`, which starts it, parks its promise and returns
Brigadier's result code; `CommandManager.dispatchCommand` collects the queue with
`collectAsyncCommands` and awaits it where it used to await the dispatcher's return value.
Rejections and feedback lines behave as before, and a command registered with a plain
`.executes(async ...)` has to be wrapped.

`CommandArgumentType` gains the 8 parameter type ids Mojang's command set uses and the table
omitted: `WildcardSelection` 10, `PathCommand` 17, `FullIntegerRange` 23, `EquipmentSlot` 47,
`BlockStateArray` 84, `ClockTimeMarker` 86, `PoiType` 88 and `CodeBuilderArgs` 92.
