---
'@jsprismarine/protocol': patch
---

The wire layout walker, which decodes when the compiled decoder is unavailable, defines each decoded field and fallback as an own property, as the compiled decoder does. Assigning them used to run the inherited `__proto__` setter for a field of that name, so an object value became the payload's prototype instead of a field.
