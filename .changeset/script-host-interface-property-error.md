---
'@jsprismarine/errors': patch
---

Add `InterfacePropertyMissing` to the script host's catalog: the `TypeError` Bedrock Dedicated Server throws when a script passes an object that lacks a property the Script API's interface needs, such as an `RGB` color without `blue`.
