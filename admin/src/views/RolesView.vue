<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Role Management</h1>
        <p>Admins manage campus content and roles. Editors manage campus content only. Nobody can change their own role.</p>
      </div>
    </header>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>
    <p v-if="notice" class="notice ok" data-test="page-notice">{{ notice }}</p>

    <section class="card" style="margin-bottom: 16px">
      <h2>Grant a role</h2>
      <ol class="muted steps">
        <li>Create or invite the person in Supabase Dashboard → Authentication → Users.</li>
        <li>Copy their <strong>User UID</strong> from that list.</li>
        <li>Paste it here and choose a role.</li>
      </ol>
      <form class="form-grid" novalidate data-test="grant-form" @submit.prevent="onGrant">
        <FormField v-slot="{ id }" name="userId" label="User UID" :error="grantErrors.userId" required>
          <input :id="id" v-model="grant.userId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" spellcheck="false" data-test="grant-user" />
        </FormField>
        <FormField v-slot="{ id }" name="role" label="Role" :error="grantErrors.role" required>
          <select :id="id" v-model="grant.role" data-test="grant-role">
            <option v-for="role in APP_ROLES" :key="role" :value="role">{{ ROLE_LABELS[role] }}</option>
          </select>
        </FormField>
        <div class="field" style="justify-content: flex-end">
          <button type="submit" :disabled="busy" data-test="grant-submit">{{ busy ? 'Saving...' : 'Grant role' }}</button>
        </div>
      </form>
    </section>

    <p v-if="loading" class="muted">Loading roles...</p>
    <div v-else-if="roles.length === 0" class="table-wrap"><p class="empty">No roles found.</p></div>
    <div v-else class="table-wrap">
      <table>
        <thead><tr><th>User UID</th><th>Role</th><th>Granted by</th><th>Updated</th><th></th></tr></thead>
        <tbody>
          <tr v-for="item in roles" :key="item.user_id" data-test="role-row">
            <td class="mono">
              {{ item.user_id }}
              <span v-if="isSelf(item)" class="badge" data-test="self-badge">You</span>
            </td>
            <td>
              <select
                v-if="!isSelf(item)"
                v-model="pendingRoles[item.user_id]"
                :aria-label="`Role for ${item.user_id}`"
                :disabled="busy"
                data-test="role-select"
              >
                <option v-for="role in APP_ROLES" :key="role" :value="role">{{ ROLE_LABELS[role] }}</option>
              </select>
              <span v-else>{{ ROLE_LABELS[item.role] }}</span>
            </td>
            <td class="mono">{{ item.granted_by ?? '—' }}</td>
            <td>{{ formatDate(item.updated_at) }}</td>
            <td class="actions">
              <template v-if="!isSelf(item)">
                <button class="small" type="button" :disabled="busy || pendingRoles[item.user_id] === item.role" data-test="role-save" @click="onChange(item)">
                  Save
                </button>
                <button class="ghost small error" type="button" :disabled="busy" data-test="role-remove" @click="pendingRemove = item">Remove</button>
              </template>
              <span v-else class="muted">Your own role cannot be changed here</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      v-if="pendingRemove"
      title="Remove role?"
      confirm-label="Remove role"
      danger
      :busy="busy"
      @cancel="pendingRemove = null"
      @confirm="onRemove(pendingRemove)"
    >
      <p>
        <span class="mono">{{ pendingRemove.user_id }}</span> will lose {{ ROLE_LABELS[pendingRemove.role] }} access.
        Their Auth account stays; delete it in the Dashboard if needed.
      </p>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FormField from '@/components/FormField.vue';
import { describeError } from '@/lib/errors';
import { validateRoleGrant, type FieldErrors, type RoleGrantForm } from '@/lib/validation';
import { changeRole, grantRole, listRoles, removeRole } from '@/services/campus';
import { useSession } from '@/stores/session';
import { APP_ROLES, ROLE_LABELS, type UserRoleRecord } from '@/types';

const session = useSession();
const roles = ref<UserRoleRecord[]>([]);
const pendingRoles = reactive<Record<string, string>>({});
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const grant = ref<RoleGrantForm>({ userId: '', role: 'editor' });
const grantErrors = ref<FieldErrors<RoleGrantForm>>({});
const pendingRemove = ref<UserRoleRecord | null>(null);

function currentUserId(): string {
  return session.state.userId ?? '';
}

function isSelf(item: UserRoleRecord): boolean {
  return item.user_id === currentUserId();
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function setRoles(list: UserRoleRecord[]) {
  roles.value = list;
  for (const item of list) pendingRoles[item.user_id] = item.role;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    setRoles(await listRoles());
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

async function onGrant() {
  error.value = '';
  notice.value = '';
  const result = validateRoleGrant(grant.value, currentUserId());
  if (!result.ok) {
    grantErrors.value = result.errors;
    return;
  }
  grantErrors.value = {};
  if (roles.value.some((item) => item.user_id === result.value.user_id)) {
    grantErrors.value = { userId: 'This user already has a role. Change it in the table below.' };
    return;
  }
  busy.value = true;
  try {
    const created = await grantRole(result.value.user_id, result.value.role, currentUserId());
    setRoles([...roles.value, created]);
    grant.value = { userId: '', role: 'editor' };
    notice.value = `Granted ${ROLE_LABELS[created.role]}.`;
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = false;
  }
}

async function onChange(item: UserRoleRecord) {
  const role = pendingRoles[item.user_id];
  if (isSelf(item) || (role !== 'admin' && role !== 'editor')) return;
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    const updated = await changeRole(item.user_id, role, currentUserId());
    setRoles(roles.value.map((row) => (row.user_id === updated.user_id ? updated : row)));
    notice.value = `Role changed to ${ROLE_LABELS[updated.role]}.`;
  } catch (err) {
    pendingRoles[item.user_id] = item.role;
    error.value = describeError(err);
  } finally {
    busy.value = false;
  }
}

async function onRemove(item: UserRoleRecord) {
  if (isSelf(item)) return;
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    await removeRole(item.user_id);
    setRoles(roles.value.filter((row) => row.user_id !== item.user_id));
    notice.value = 'Role removed.';
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busy.value = false;
    pendingRemove.value = null;
  }
}

onMounted(load);
</script>

<style scoped>
.steps {
  margin: 0 0 12px;
  padding-left: 20px;
  font-size: 14px;
}
</style>
