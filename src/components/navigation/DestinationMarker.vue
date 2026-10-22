<template>
  <div class="marker">
    <strong>{{ name }}</strong>
    <span>{{ distanceLabel }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  distanceLabel: string;
}>();
</script>

<style scoped>
.marker {
  min-width: 148px;
  padding: 8px 12px 10px;
  border-radius: 14px;
  background: rgba(11, 58, 91, 0.88);
  color: #f4fbff;
  text-align: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.marker strong,
.marker span {
  display: block;
}

.marker strong {
  font-size: 14px;
}

.marker span {
  margin-top: 2px;
  color: #8be9ff;
  font-size: 18px;
  font-weight: 700;
}
</style>
