<template>
  <div class="center-page"><form class="card narrow auth-card" @submit.prevent="submit">
    <header class="auth-header">
      <img class="login-brand-logo" src="/images/1locate-logo.png" alt="1Locate logo" />
      <h1>{{ step === 'done' ? 'Password updated' : 'Reset password' }}</h1>
      <p v-if="step === 'email'" class="muted">Enter your account email and we'll send you a reset code.</p>
      <p v-else-if="step === 'code'" class="muted">If an account exists for <strong>{{ email }}</strong>, a code is on its way. Check your spam folder too.</p>
      <p v-else-if="step === 'password'" class="muted">Choose a new password for your account.</p>
    </header>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="message" class="notice ok" role="status">{{ message }}</p>
    <template v-if="step === 'email'">
      <div class="field"><label for="reset-email">Email</label><input id="reset-email" v-model="email" :disabled="busy" type="email" autocomplete="username" maxlength="254" placeholder="you@example.com" required /></div>
    </template>
    <template v-else-if="step === 'code'">
      <div class="field"><label for="reset-code">Reset code</label><input id="reset-code" v-model="token" class="code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" placeholder="Enter code" required /></div>
    </template>
    <template v-else-if="step === 'password'">
      <div class="field"><label for="new-password">New password</label><input id="new-password" v-model="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /></div>
      <div class="field"><label for="confirm-password">Confirm password</label><input id="confirm-password" v-model="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /></div>
      <p class="auth-hint">Use at least 12 characters.</p>
    </template>
    <button v-if="step !== 'done'" type="submit" class="auth-submit" :disabled="busy || (step === 'email' && cooldown > 0)">{{ busy ? 'Please wait...' : step === 'email' ? 'Send reset code' : step === 'code' ? 'Verify code' : 'Save password' }}</button>
    <div v-if="step === 'code'" class="auth-secondary-row">
      <button type="button" class="secondary" :disabled="busy || cooldown > 0" @click="send">{{ cooldown ? `Resend in ${cooldown}s` : 'Resend code' }}</button>
    </div>
    <RouterLink v-if="step === 'done'" to="/login" class="button auth-submit">Back to sign in</RouterLink>
    <div v-else class="auth-footer"><RouterLink to="/login" class="auth-link">← Back to sign in</RouterLink></div>
  </form></div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { createAccountAuth } from '@/services/account-auth';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/stores/session';
const auth = createAccountAuth(supabase);
const session = useSession();
const step = ref<'email' | 'code' | 'password' | 'done'>('email');
const email = ref(''); const token = ref(''); const password = ref(''); const confirmation = ref('');
const error = ref(''); const message = ref(''); const busy = ref(false); const cooldown = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
let recoveryVerified = false;
let disposed = false;
async function send() {
  if (busy.value || cooldown.value) return;
  busy.value = true; error.value = '';
  try {
    await auth.sendRecovery(email.value); email.value = email.value.trim(); step.value = 'code';
    cooldown.value = 60; clearInterval(timer);
    timer = setInterval(() => { if (cooldown.value > 0) cooldown.value -= 1; else clearInterval(timer); }, 1000);
  } catch (err) { error.value = err instanceof Error ? err.message : 'Could not send a code.'; }
  finally { busy.value = false; }
}
async function submit() {
  if (busy.value) return;
  if (step.value === 'email') return send();
  busy.value = true; error.value = '';
  try {
    if (step.value === 'code') { await auth.verifyRecovery(email.value, token.value); if (disposed) { await session.signOut(); return; } recoveryVerified = true; token.value = ''; step.value = 'password'; }
    else if (step.value === 'password' && recoveryVerified) {
      await auth.updatePassword(password.value, confirmation.value);
      password.value = ''; confirmation.value = ''; await session.signOut(); recoveryVerified = false;
      step.value = 'done'; message.value = 'Password updated. Sign in with your new password.';
    }
  } catch (err) { error.value = err instanceof Error ? err.message : 'Password reset failed.'; }
  finally { busy.value = false; }
}
onBeforeUnmount(() => { disposed = true; clearInterval(timer); password.value = ''; confirmation.value = ''; token.value = ''; if (recoveryVerified) void session.signOut(); });
</script>
<style scoped>
.code-input { font-size: 18px; letter-spacing: 0.2em; text-align: center; }
.code-input::placeholder { font-size: 15px; letter-spacing: normal; }
</style>
