<template>
  <div class="center-page">
    <form class="card narrow" novalidate data-test="login-form" @submit.prevent="onSubmit">
      <img class="login-brand-logo" src="/images/1locate-logo.png" alt="1Locate logo" /><h1>1Locate Admin</h1>
      <p class="muted">Sign in with the account an Admin created for you.</p>
      <p v-if="error" class="notice error" role="alert" data-test="login-error">{{ error }}</p>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="username" required data-test="email" />
      </div>
      <div class="field" style="margin-top: 12px">
        <label for="password">Password</label>
        <div class="password-wrap">
          <input
            id="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            required
            data-test="password"
          />
          <button
            type="button"
            class="password-toggle"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword"
            data-test="toggle-password"
            @click="showPassword = !showPassword"
          >
            <svg v-if="showPassword" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              />
              <path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M4 5l16 14" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 6.5c-5 0-8.3 4.2-9.2 5.5.9 1.3 4.2 5.5 9.2 5.5s8.3-4.2 9.2-5.5c-.9-1.3-4.2-5.5-9.2-5.5zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm0-1.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
              />
            </svg>
          </button>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" :disabled="busy" data-test="sign-in">{{ busy ? 'Signing in...' : 'Sign in' }}</button>
      </div>
      <RouterLink to="/forgot-password" data-test="forgot-password">Forgot password?</RouterLink>
      <div class="form-actions"><button type="button" :disabled="busy" data-test="google-sign-in" @click="onGoogle">Continue with Google</button></div>
      <p class="muted" style="margin-top: 12px; font-size: 13px">
        Google accounts still need an assigned Admin or Editor role. Accounts are managed in Supabase Dashboard → Authentication.
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { createAccountAuth } from '@/services/account-auth';
import { supabase } from '@/lib/supabase';
import { safeRedirect } from '@/lib/validation';
import { useSession } from '@/stores/session';

const session = useSession();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const error = ref('');
const busy = ref(false);

async function onGoogle() {
  error.value = ''; busy.value = true;
  try {
    sessionStorage.setItem('1locate-auth-redirect', safeRedirect(route.query.redirect));
    await createAccountAuth(supabase).google();
  } catch (err) { error.value = err instanceof Error ? err.message : 'Google sign-in failed.'; }
  finally { busy.value = false; }
}

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

<style scoped>
.password-wrap {
  position: relative;
}
.password-wrap input {
  width: 100%;
  padding-right: 40px;
}
.password-toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.password-toggle:hover {
  color: inherit;
}
.password-toggle svg {
  width: 20px;
  height: 20px;
}
</style>
