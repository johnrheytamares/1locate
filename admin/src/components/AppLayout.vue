<template>
  <div class="layout">
    <header class="topbar">
      <button class="ghost menu" type="button" aria-label="Toggle navigation" @click="menuOpen = !menuOpen">☰</button>
      <strong class="brand">1Locate Admin</strong>
      <div class="user">
        <span class="email" data-test="user-email">{{ session.state.email }}</span>
        <span class="badge" data-test="user-role">{{ roleLabel }}</span>
        <button class="secondary small" type="button" data-test="logout" :disabled="signingOut" @click="onSignOut">
          {{ signingOut ? 'Signing out...' : 'Log out' }}
        </button>
      </div>
    </header>
    <nav class="sidebar" :class="{ open: menuOpen }" aria-label="Main">
      <router-link v-for="item in items" :key="item.name" :to="{ name: item.name }" @click="menuOpen = false">
        {{ item.label }}
      </router-link>
    </nav>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import { ROLE_LABELS } from '@/types';

const session = useSession();
const router = useRouter();
const menuOpen = ref(false);
const signingOut = ref(false);

const roleLabel = computed(() => (session.state.role ? ROLE_LABELS[session.state.role] : ''));

const items = computed(() => [
  { name: 'dashboard', label: 'Dashboard' },
  { name: 'buildings', label: 'Buildings' },
  { name: 'floors', label: 'Floors' },
  { name: 'rooms', label: 'Rooms / Offices' },
  { name: 'destinations', label: 'Destination Links' },
  ...(session.isAdmin.value ? [{ name: 'roles', label: 'Role Management' }] : []),
]);

async function onSignOut() {
  signingOut.value = true;
  try {
    await session.signOut();
  } finally {
    signingOut.value = false;
    await router.replace({ name: 'login' });
  }
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: auto 1fr;
  grid-template-areas: "top top" "side main";
}

.topbar {
  grid-area: top;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--navy);
  color: #fff;
}

.brand { font-size: 17px; }

.user {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.menu { display: none; color: #fff; font-size: 20px; }

.sidebar {
  grid-area: side;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px;
  background: #fff;
  border-right: 1px solid var(--line);
}

.sidebar a {
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--ink);
  text-decoration: none;
  font-weight: 500;
}

.sidebar a.router-link-exact-active {
  background: var(--blue-soft);
  color: var(--navy);
  font-weight: 700;
}

.content {
  grid-area: main;
  padding: 20px;
  min-width: 0;
}

@media (max-width: 800px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-areas: "top" "main";
  }

  .menu { display: inline-block; }
  .email { display: none; }

  .sidebar {
    display: none;
    position: fixed;
    top: 52px;
    left: 0;
    right: 0;
    z-index: 40;
    border-bottom: 1px solid var(--line);
  }

  .sidebar.open { display: flex; }
  .content { padding: 14px; }
}
</style>
