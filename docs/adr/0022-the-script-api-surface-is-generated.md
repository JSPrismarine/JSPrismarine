# The Script API's shape is generated from Mojang's metadata

Status: accepted

Mojang's `bedrock-samples` publishes binding metadata for every script module and version under
`metadata/script_modules/@minecraft/`. `@minecraft/server` alone has dozens of stable versions,
and each one adds, changes or removes members. The host generates everything about the API's shape
from that metadata: modules, versions, classes, members, argument types and their validation,
enums and constants, error classes, and the privilege each member allows, such as restricted or
early execution. Only behavior is written by hand.

BDS serves each pack the newest stable minor version of the major version it declares: on the
pinned server a pack declaring 2.0.0 sees the 2.10.0 API, and one declaring 1.0.0 sees 1.19.0's.
The host does the same, so each pinned BDS has one stable shape for each major version. The older
minor versions stay in the generated data as history.

The metadata has gaps. `CustomCommandRegistry.registerCommand`'s callback carries no privilege,
although BDS runs it restricted. A short list of overrides, each with the BDS run that shows it,
fills such gaps, and the generator fails when an override no longer matches a gap.

A pack gets the shape of its major version. A member that exists in that version but that JSP
does not implement yet is still present, so `typeof` checks and feature tests behave as on BDS. Calling it throws a `NotImplementedError` that
names the module, the class and the member, and the host logs it once per pack. At load the host
scans each pack's imports and member accesses where it can, and prints how much of what the pack
uses is implemented.

A bump of the pinned BDS regenerates the shape. The diff shows what Mojang added and changed, and
every new member starts as not implemented. The metadata is a `bedrock-samples` input, which
[ADR 0019](0019-bedrock-data-comes-from-bds.md) already allows.

## Considered options

**Write the API by hand against the `@minecraft/server` npm typings.** The typings carry no
argument validation and no privilege tags, and every version bump would be a hand edit across
thousands of members.

**Leave unimplemented members out**, as if the module were older. A pack that feature-tests a
member would take its fallback path on JSP and its main path on BDS, and behave differently on
the two servers for a reason no log names.

**Refuse to load a pack that uses an unimplemented member.** Most packs use a member or two that a
young host lacks, and would not load at all.
