---
title: Parity tracker
description: How much of vanilla Minecraft behavior JSPrismarine matches, checked by the parity suite.
pageClass: is-wide
aside: false
outline: false
---

<script setup>
import { data } from './parity.data.mts';
</script>

<div class="vp-raw">
<ParityTracker :snapshot="data" />
</div>
