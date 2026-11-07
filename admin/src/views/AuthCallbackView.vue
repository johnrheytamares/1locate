<template><div class="center-page"><section class="card narrow"><h1>Google sign-in</h1><p role="status">{{ message }}</p><RouterLink v-if="failed" to="/login">Back to sign in</RouterLink></section></div></template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { createAccountAuth } from '@/services/account-auth';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/stores/session';
import { safeRedirect } from '@/lib/validation';
const router = useRouter(); const session = useSession();
const message = ref('Completing sign-in...'); const failed = ref(false);
onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  window.history.replaceState({}, '', '/auth/callback');
  try {
    if (params.has('error') || !code) throw new Error('Google sign-in was cancelled or could not be completed.');
    await createAccountAuth(supabase).exchange(code);
    await session.restore();
    const target = safeRedirect(sessionStorage.getItem('1locate-auth-redirect'));
    sessionStorage.removeItem('1locate-auth-redirect');
    await router.replace(session.canManageContent.value ? target : '/access-denied');
  } catch (err) { failed.value = true; message.value = err instanceof Error ? err.message : 'Sign-in failed.'; }
});
</script>
