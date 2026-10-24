---
'@jsprismarine/prismarine': patch
---

`ModalFormResponseHandler` drops a form response whose text does not parse as JSON and logs it at warn, instead of recording it as a submitted form.
