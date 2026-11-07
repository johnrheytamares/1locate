<template>
  <div class="center-page"><form class="card narrow" @submit.prevent="submit">
    <h1>Reset password</h1>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <template v-if="step === 'email'">
      <p class="muted">Enter your account email to request a password reset code.</p>
      <div class="field"><label for="reset-email">Email</label><input id="reset-email" v-model="email" :disabled="busy" type="email" autocomplete="username" maxlength="254" required /></div>
    </template>
    <template v-else-if="step === 'code'">
      <p class="muted">If an account exists for {{ email }}, a reset code will arrive by email. Check your spam folder too.</p>
      <div class="field"><label for="reset-code">Email code</label><input id="reset-code" v-model="token" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required /></div>
      <button type="button" class="secondary" :disabled="busy || cooldown > 0" @click="send">{{ cooldown ? `Resend in ${cooldown}s` : 'Resend code' }}</button>
      <button type="button" class="secondary" :disabled="busy" @click="step = 'email'; token = ''; message = ''">Change email</button>
    </template>
    <template v-else-if="step === 'password'">
      <div class="field"><label for="new-password">New password</label><input id="new-password" v-model="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /></div>
      <div class="field"><label for="confirm-password">Confirm password</label><input id="confirm-password" v-model="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /></div>
      <p class="muted">Use at least 12 characters. Your account may require additional password rules.</p>
    </template>
    <div v-if="step !== 'done'" class="form-actions"><button type="submit" :disabled="busy || (step === 'email' && cooldown > 0)">{{ busy ? 'Please wait...' : step === 'email' ? 'Send reset code' : step === 'code' ? 'Verify code' : 'Save password' }}</button></div>
    <RouterLink to="/login">Back to sign in</RouterLink>
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
.field { margin: 14px 0; }.secondary { margin: 10px 8px 10px 0; }a { display: inline-block; margin-top: 16px; }
</style>
