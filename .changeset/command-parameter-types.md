---
'@jsprismarine/prismarine': patch
---

Send command parameter types a 1.26.50 client understands (#2582).

`CommandParameterType` still carried the argument type ids of a much older protocol (`Target` 7, `String` 0x20, `Position` 0x29), while `AvailableCommandsPacket` kept its own copy with newer numbers, so a `/tp` target went out typed as a comparison operator (id 7 in 2193) and every string as id 32, a selector argument value. Both now read from one table in `CommandParameter.ts` that matches gophertunnel's `command.go` at protocol 2193 (`Target` 8, `String` 56, `Position` 65, `Message` 67, `RawText` 70, `Json` 74, `Command` 87); the packet's unused `ARG_*` fields are gone. A soft enum parameter's type word also pointed at the hard enum table instead of the soft one, and a soft enum that only a parameter named was never written at all; the packet writes the collected soft enum list and indexes into it.
