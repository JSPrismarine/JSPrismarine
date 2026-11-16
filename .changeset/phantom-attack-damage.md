---
'@jsprismarine/entities': patch
---

Keep the phantom's Bedrock attack damage of 6. Java's attribute dump publishes 2, the monster default, because `Phantom.updatePhantomSizeInfo` sets the damage to 6 plus the phantom's size in code, so taking the dump left a phantom's bite at a third of its strength.
