<template>
  <div v-if="supabaseConfigProblem" class="center-page">
    <section class="card narrow">
      <h1>Setup needed</h1>
      <p v-if="supabaseConfigProblem === 'privileged-key'" class="error">
        The configured key can bypass database security. Use the anon / publishable key in
        <code>.env</code>, never the service-role or secret key.
      </p>
      <p v-else>
        Copy <code>.env.example</code> to <code>.env</code> and fill in the Supabase URL and anon key, then restart.
      </p>
    </section>
  </div>
  <router-view v-else />
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { supabaseConfigProblem } from '@/lib/supabase';
import { useSession } from '@/stores/session';

const session = useSession();
const router = useRouter();
const route = useRoute();

watch(() => session.state.status, (status) => {
  // Before the first navigation resolves, route is the empty start location; the router guard handles that case.
  if (status === 'signed-out' && route.matched.length > 0 && !route.meta.public) {
    void router.replace({ name: 'login' });
  }
});
</script>
