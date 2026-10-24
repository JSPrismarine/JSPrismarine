---
'@jsprismarine/mcfunction': patch
---

Add `@jsprismarine/mcfunction`, the Java Edition function runtime. It loads `.mcfunction` files and
function tags from a pack stack, compiles each file once, and runs it against an injected
`CommandRunner`, so the package implements no commands of its own. It parses the line format
including `#` comments, `\` continuation and `$` macro lines, substitutes `$(variable)` from an
argument compound with Java's no-suffix number rules and an 8-entry parse cache per macro function,
resolves `#namespace:tag` references including nested tags and the two lifecycle tags
`minecraft:load` and `minecraft:tick`, and executes through an explicit frame queue that bounds a
run with `maxCommandSequenceLength` and `maxCommandForks` (both defaulting to 65536, a figure
Mojang has never published) and reports a tripped limit instead of throwing. Nesting 20000 calls
deep does not touch the JavaScript stack, and a tail call replaces its frame rather than stacking
on it.
