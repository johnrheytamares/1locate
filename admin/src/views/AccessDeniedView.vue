<template>
  <div class="center-page">
    <section class="card narrow" data-test="access-denied">
      <h1>Access denied</h1>
      <p v-if="session.state.roleError" class="notice error" data-test="role-error">
        Your role could not be checked: {{ session.state.roleError }}
      </p>
      <p v-else-if="adminOnly">
        Only Admins can open Role Management. Your role is {{ roleLabel }}.
      </p>
      <p v-else>
        You are signed in as <strong>{{ session.state.email }}</strong>, but this account has no Admin or
        Editor role. Ask an Admin to grant you access.
      </p>
      <div class="form-actions">
        <button v-if="session.state.roleError" class="secondary" type="button" :disabled="busy" @click="onRetry">Retry</button>
        <button v-if="session.canManageContent.value" class="secondary" type="button" @click="router.replace({ name: 'dashboard' })">
          Go to dashboard
        </button>
        <button type="button" data-test="logout" :disabled="busy" @click="onSignOut">Log out</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import { ROLE_LABELS } from '@/types';

const session = useSession();
const router = useRouter();
const route = useRoute();
const busy = ref(false);

const adminOnly = computed(() => route.query.reason === 'admin' && session.canManageContent.value);
const roleLabel = computed(() => (session.state.role ? ROLE_LABELS[session.state.role] : 'none'));

watch(
  () => session.canManageContent.value && route.query.reason !== 'admin',
  (goToDashboard) => {
    if (goToDashboard) void router.replace({ name: 'dashboard' });
  },
  { immediate: true },
);

async function onRetry() {
  busy.value = true;
  try {
    await session.refreshRole();
    if (session.canManageContent.value) await router.replace({ name: 'dashboard' });
  } finally {
    busy.value = false;
  }
}

async function onSignOut() {
  busy.value = true;
  try {
    await session.signOut();
  } finally {
    busy.value = false;
    await router.replace({ name: 'login' });
  }
}
</script>
