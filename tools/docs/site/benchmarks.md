---
title: Benchmarks
description: JSPrismarine, Pumpkin and Bedrock Dedicated Server under one bot workload, with the method, every run's raw data and a history of each change.
pageClass: is-wide
aside: false
outline: false
---

<script setup>
import { data } from './benchmarks.data.mts';
</script>

<div class="vp-raw">
<ServerBenchmarks :data="data" />
</div>
