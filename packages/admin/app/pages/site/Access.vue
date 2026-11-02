<script setup lang="ts">
import Page from '../../components/Page.vue'
import { ref } from 'vue'
import StructureDialogs from '../../components/StructureDialogs.vue'
import { useMessages } from '../../i18n/index.ts'
import { accessForm, accessOf, type ProvisionRole } from '../../lib/access.ts'
import { useSiteSettings } from '../../lib/site-settings.ts'

const m = useMessages()
const on = ref(false)
const domains = ref('')
const emails = ref('')
const role = ref<ProvisionRole>('author')
const error = ref<string | null>(null)

const { structure, change, load, save } = useSiteSettings({
  fill: (read) => {
    const form = accessForm(read.definition.access)
    on.value = form.on
    domains.value = form.domains
    emails.value = form.emails
    role.value = form.role
    error.value = null
  },
  values: () => [on.value, domains.value, emails.value, role.value],
})

async function saveAccess() {
  const access = accessOf({
    on: on.value,
    domains: domains.value,
    emails: emails.value,
    role: role.value,
  })
  if (access === 'empty') {
    error.value = m.value.site.accessEmpty
    return
  }
  error.value = null
  await save((definition) => ({ ...definition, access }))
}
</script>

<template>
  <Page :title="m.settings.sections.signin" :description="m.site.accessHelp">
    <div v-if="structure !== null" class="max-w-2xl space-y-4">
      <StructureDialogs
        :impact="change.impact.value"
        :problems="change.problems.value"
        :conflict="change.conflict.value"
        :failure="change.failure.value"
        @confirm="change.confirmPending"
        @cancel="change.cancel"
        @reload="load"
      />
      <form class="space-y-4" novalidate @submit.prevent="saveAccess">
        <USwitch v-model="on" :label="m.site.accessOn" />
        <template v-if="on">
          <UFormField
            :label="m.site.accessDomains"
            :help="m.site.accessDomainsHelp"
            :error="error ?? undefined"
          >
            <UTextarea v-model="domains" :rows="3" autoresize class="w-full font-mono" />
          </UFormField>
          <UFormField :label="m.site.accessEmails" :help="m.site.accessEmailsHelp">
            <UTextarea v-model="emails" :rows="3" autoresize class="w-full font-mono" />
          </UFormField>
          <UFormField :label="m.site.accessRole" :help="m.site.accessRoleHelp">
            <USelect
              v-model="role"
              :items="[
                { label: m.roles.reviewer ?? 'reviewer', value: 'reviewer' },
                { label: m.roles.author ?? 'author', value: 'author' },
                { label: m.roles.editor ?? 'editor', value: 'editor' },
              ]"
              class="w-40"
            />
          </UFormField>
        </template>
        <UButton type="submit" :label="m.site.saveAccess" :loading="change.busy.value" />
      </form>
    </div>
    <p v-else class="text-muted">{{ m.common.loading }}</p>
  </Page>
</template>
