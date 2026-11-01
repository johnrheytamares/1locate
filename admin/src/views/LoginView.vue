<template>
  <div class="center-page">
    <form class="card narrow" novalidate data-test="login-form" @submit.prevent="onSubmit">
      <h1>1Locate Admin</h1>
      <p class="muted">Sign in with the account an Admin created for you.</p>
      <p v-if="error" class="notice error" role="alert" data-test="login-error">{{ error }}</p>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="username" required data-test="email" />
      </div>
      <div class="field" style="margin-top: 12px">
        <label for="password">Password</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required data-test="password" />
      </div>
      <div class="form-actions">
        <button type="submit" :disabled="busy" data-test="sign-in">{{ busy ? 'Signing in...' : 'Sign in' }}</button>
      </div>
      <p class="muted" style="margin-top: 12px; font-size: 13px">
        There is no public sign-up. New accounts are added in Supabase Dashboard → Authentication.
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { safeRedirect } from '@/lib/validation';
import { useSession } from '@/stores/session';

const session = useSession();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function onSubmit() {
  error.value = '';
  busy.value = true;
  try {
    await session.signIn(email.value, password.value);
    password.value = '';
    const target = session.canManageContent.value ? safeRedirect(route.query.redirect) : '/access-denied';
    await router.replace(target);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Sign in failed.';
  } finally {
    busy.value = false;
  }
}
</script>
