<template>
    <div class="bento-grid"><slot /></div>
</template>

<style scoped>
.bento-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
}
</style>
