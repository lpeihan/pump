<template>
  <van-popup v-model:show="show" round :close-on-click-overlay="false" closeable>
    <div>Simple</div>
  </van-popup>
</template>

<script setup>
import { ref } from 'vue';

const show = ref(false);

const open = () => {
  show.value = true;
};

const close = () => {
  show.value = false;
};

defineExpose({
  open,
  close,
});
</script>
