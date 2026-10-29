---
'@jsprismarine/minecraft': patch
---

Apply the datagen recipe ID aliases again. They were matched against the recipe's source
ID while their keys carry the crafting station, so every one of them missed and
`recipes.json` could not be regenerated from the server it was built from. The published
recipe book is unchanged; regenerating now reproduces it.
