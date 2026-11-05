<template>
  <div class="marker">
    <svg class="marker-pin" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" /></svg>
    <div>
    <strong>{{ name }}</strong>
    <span>{{ distanceLabel }}</span>
    </div>
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
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 148px;
  padding: 8px 12px 10px;
  border-radius: 14px;
  max-width: 230px;
  border: 1px solid #9deaff;
  background: linear-gradient(135deg, #008ce9ee, #0759afeF);
  color: #f4fbff;
  text-align: left;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.marker strong,
.marker span {
  display: block;
}

.marker strong {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.marker span {
  margin-top: 2px;
  color: #8be9ff;
  font-size: 13px;
  font-weight: 700;
}
.marker-pin { width: 21px; height: 25px; flex-shrink: 0; }
.marker::after { content: ''; position: absolute; left: 50%; bottom: -26px; width: 2px; height: 24px; border: 2px solid #96edff; background: #06b7ff70; border-radius: 50%; transform: translateX(-50%); box-shadow: 0 0 12px #00baff; }
</style>
