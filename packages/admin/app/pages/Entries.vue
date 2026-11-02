<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EntryList from '../components/EntryList.vue'
import Page from '../components/Page.vue'
import type { Output } from '../lib/api.ts'
import { countOutcomes, runAll } from '../lib/bulk.ts'
import { useBulkReport } from '../lib/bulk-report.ts'
import { useMessages } from '../i18n/index.ts'
import { entryPath, titleOf } from '../lib/entries.ts'
import { matches } from '../lib/entry-list.ts'
import { can, me } from '../lib/me.ts'
import { operation } from '../lib/queries.ts'
import { api } from '../lib/session.ts'
import { pageUrl } from '../lib/site.ts'

type Entry = Output<'list_entries'>['entries'][number]
type Status = Entry['status']
type Row = Entry & { title: string }
type Warning = Output<'validate'>['verdict']['warnings'][number]

const ALL = 'all'
const TRASH = 'trash'
const MOST = 2000

const m = useMessages()
const route = useRoute()
const router = useRouter()
const siteQuery = useQuery(operation('describe_site', {}))
const site = computed(() => siteQuery.data.value?.site ?? null)

function queried(name: string, fallback: string): string {
  const value = route.query[name]
  return typeof value === 'string' && value !== '' ? value : fallback
}
const collection = ref(queried('collection', ''))
const locale = ref(queried('locale', ALL))
const status = ref(queried('status', ALL))
const selected = ref<string[]>([])

const definition = computed(() =>
  site.value?.collections.find((candidate) => candidate.name === collection.value),
)

watch(
  site,
  (described) => {
    if (described === null) return
    if (!described.collections.some((candidate) => candidate.name === collection.value)) {
      collection.value = described.collections[0]?.name ?? ''
    }
  },
  { immediate: true },
)

const entriesQuery = useQuery(() => {
  const filters = {
    collection: collection.value,
    ...(locale.value === ALL ? {} : { locale: locale.value }),
    ...(status.value === ALL
      ? {}
      : status.value === TRASH
        ? { trashed: true }
        : { status: status.value as Status }),
  }
  return {
    key: ['entries', filters],
    query: async ({ signal }: { signal: AbortSignal }) => {
      const all: Entry[] = []
      let cursor: string | null = null
      do {
        const answer: Output<'list_entries'> = await api.call(
          'list_entries',
          { ...filters, limit: 100, ...(cursor === null ? {} : { cursor }) },
          signal,
        )
        all.push(...answer.entries)
        cursor = answer.nextCursor
      } while (cursor !== null && all.length < MOST)
      return { entries: all, truncated: cursor !== null }
    },
    enabled: collection.value !== '',
  }
})
const entries = computed(() => entriesQuery.data.value?.entries ?? [])
const truncated = computed(() => entriesQuery.data.value?.truncated ?? false)
const loading = computed(() => collection.value !== '' && entriesQuery.isPending.value)

watch(
  () => route.query,
  () => {
    collection.value = queried('collection', collection.value)
    locale.value = queried('locale', ALL)
    status.value = queried('status', ALL)
  },
)

watch([collection, locale, status], async () => {
  selected.value = []
  await router.replace({
    query: Object.fromEntries(
      [
        ['collection', collection.value],
        ['locale', locale.value],
        ['status', status.value],
      ].filter(([, value]) => value !== '' && value !== ALL),
    ),
  })
})

const filter = ref(queried('q', ''))
const rows = computed<Row[]>(() =>
  entries.value
    .map((entry) => ({ ...entry, title: titleOf(entry) }))
    .filter((row) => matches(row, filter.value)),
)
const chosen = computed(() => rows.value.filter((row) => selected.value.includes(row.id)))

const siblings = computed(() => {
  const groups = new Map<string, Entry[]>()
  for (const entry of entries.value) {
    if (entry.translationGroup === null) continue
    groups.set(entry.translationGroup, [...(groups.get(entry.translationGroup) ?? []), entry])
  }
  return groups
})
function translationsOf(entry: Entry): Entry[] {
  if (entry.translationGroup === null) return []
  return (siblings.value.get(entry.translationGroup) ?? []).filter((other) => other.id !== entry.id)
}

function liveUrl(entry: Entry): string | null {
  if (entry.status !== 'published' || definition.value === undefined) return null
  return pageUrl(site.value?.url ?? null, definition.value.routes, entry.locale, entry.slug)
}

const reportBulk = useBulkReport()
const busy = ref(false)
const publishable = (entry: Row) =>
  entry.deletedAt === null && (entry.status !== 'published' || entry.hasUnpublishedChanges)
const unpublishable = (entry: Row) => entry.deletedAt === null && entry.status !== 'draft'
const trashable = (entry: Row) => entry.deletedAt === null && entry.status === 'draft'
const restorable = (entry: Row) => entry.deletedAt !== null

const unpublishing = ref<Row[]>([])
const trashing = ref<Row[]>([])
const owner = computed(() => can(me.value, 'site:owner'))
const purgeable = (entry: Row) => entry.deletedAt !== null && owner.value
const purging = ref<Row[]>([])
const scheduling = ref<Row[]>([])
const publishAt = ref('')
const warned = ref<{ row: Row; warnings: Warning[] }[]>([])
let warnedAt: string | undefined
const open = (list: { value: unknown[] }) =>
  computed({
    get: () => list.value.length > 0,
    set: (value: boolean) => {
      if (!value) list.value = []
    },
  })
const unpublishOpen = open(unpublishing)
const trashOpen = open(trashing)
const purgeOpen = open(purging)
const scheduleOpen = open(scheduling)
const warnedOpen = open(warned)

async function publishMany(
  rows: readonly Row[],
  at?: string,
  acknowledged: ReadonlyMap<string, readonly Warning[]> = new Map(),
) {
  busy.value = true
  scheduling.value = []
  warned.value = []
  try {
    const results = await runAll(rows, (row) =>
      api.call('publish', {
        id: row.id,
        version: row.version,
        acknowledgeWarnings: (acknowledged.get(row.id) ?? []).map(({ contract, path }) => ({
          contract,
          path,
        })),
        ...(at === undefined ? {} : { publishAt: at }),
      }),
    )
    reportBulk(countOutcomes(results))
    warnedAt = at
    warned.value = results.flatMap((result) =>
      'answer' in result && result.answer.outcome === 'needs_acknowledgement'
        ? [{ row: result.item, warnings: result.answer.verdict?.warnings ?? [] }]
        : [],
    )
  } finally {
    busy.value = false
  }
}

async function acceptWarnings() {
  const accepted = new Map(warned.value.map(({ row, warnings }) => [row.id, warnings]))
  await publishMany(
    warned.value.map(({ row }) => row),
    warnedAt,
    accepted,
  )
}

function openSchedule(rows: readonly Row[]) {
  const soon = new Date(Date.now() + 3_600_000)
  soon.setSeconds(0, 0)
  publishAt.value = new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
  scheduling.value = [...rows]
}
const scheduleError = computed(() => {
  const at = Date.parse(publishAt.value)
  if (Number.isNaN(at)) return m.value.entry.pickDateTime
  return at <= Date.now() ? m.value.entry.pickFuture : null
})

async function unpublishMany() {
  const rows = unpublishing.value
  unpublishing.value = []
  busy.value = true
  try {
    reportBulk(countOutcomes(await runAll(rows, (row) => api.call('unpublish', { id: row.id }))))
  } finally {
    busy.value = false
  }
}

async function trashMany() {
  const rows = trashing.value
  trashing.value = []
  busy.value = true
  try {
    const results = await runAll(rows, async (row) => {
      const answer = await api.call('delete_entry', { id: row.id, version: row.version })
      return { outcome: answer.outcome === 'published' ? 'not_draft' : answer.outcome }
    })
    reportBulk(countOutcomes(results))
  } finally {
    busy.value = false
  }
}

async function purgeMany() {
  const rows = purging.value
  purging.value = []
  busy.value = true
  try {
    reportBulk(
      countOutcomes(
        await runAll(rows, (row) => api.admin<{ outcome: string }>(`entries/${row.id}/purge`, {})),
      ),
    )
  } finally {
    busy.value = false
  }
}

async function restoreMany(rows: readonly Row[]) {
  busy.value = true
  try {
    reportBulk(
      countOutcomes(await runAll(rows, (row) => api.call('restore_entry', { id: row.id }))),
    )
  } finally {
    busy.value = false
  }
}

const views = computed(() => [
  { label: m.value.entries.views.all, value: ALL },
  { label: m.value.entries.views.drafts, value: 'draft' },
  { label: m.value.entries.views.scheduled, value: 'scheduled' },
  { label: m.value.entries.views.published, value: 'published' },
  { label: m.value.entries.views.trash, value: TRASH },
])
const locales = computed(() => [
  { label: m.value.entries.anyLocale, value: ALL },
  ...(site.value?.locales ?? []).map((value) => ({ label: value, value })),
])
</script>

<template>
  <Page :title="m.entries.title" flush>
    <template #actions>
      <UButton
        :label="m.entries.newEntry"
        icon="i-lucide-plus"
        size="sm"
        :to="{ path: '/entries/new', query: collection === '' ? {} : { collection } }"
      />
    </template>
    <template #toolbar>
      <UTabs
        v-model="status"
        :items="views"
        :content="false"
        :aria-label="m.entries.status"
        variant="pill"
        size="xs"
        class="shrink-0"
        :ui="{ trigger: 'transition-none', indicator: 'transition-none' }"
      />
      <div class="ms-auto flex items-center gap-2">
        <template v-if="site !== null">
          <USelect
            v-model="collection"
            :items="site.collections.map((c) => c.name)"
            :aria-label="m.entries.collection"
            icon="i-lucide-layers"
            size="sm"
            class="w-36"
          />
          <USelect
            v-model="locale"
            :items="locales"
            :aria-label="m.entries.locale"
            icon="i-lucide-languages"
            size="sm"
            class="w-36"
          />
        </template>
        <UInput
          v-model="filter"
          icon="i-lucide-search"
          size="sm"
          :placeholder="m.entries.filter"
          :aria-label="m.entries.filter"
          class="w-56"
        />
      </div>
    </template>
    <EntryList v-model:selected="selected" :rows="rows" :loading="loading" :empty="m.entries.empty">
      <template #locales="{ row }">
        <RouterLink
          v-for="other in translationsOf(row)"
          :key="other.id"
          :to="entryPath(other)"
          :aria-label="`${other.locale} · ${titleOf(other)}`"
          class="text-muted underline-offset-2 hover:text-highlighted hover:underline"
          >{{ other.locale }}</RouterLink
        >
      </template>
      <template #trailing="{ row }">
        <UButton
          v-if="row.deletedAt !== null"
          :label="m.entries.restore"
          :aria-label="m.entries.restoreOne(row.title)"
          icon="i-lucide-undo-2"
          variant="outline"
          size="xs"
          :disabled="busy"
          @click="restoreMany([row])"
        />
        <UButton
          v-if="liveUrl(row) !== null"
          :to="liveUrl(row) ?? undefined"
          target="_blank"
          icon="i-lucide-external-link"
          variant="ghost"
          color="neutral"
          size="xs"
          :aria-label="m.entries.onSite(row.title)"
        />
      </template>
    </EntryList>
    <div
      v-if="chosen.length > 0"
      role="toolbar"
      :aria-label="m.table.bulk"
      class="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-default bg-elevated px-3 py-2 shadow-lg"
    >
      <span class="px-1 text-sm text-muted">{{ m.table.selected(chosen.length) }}</span>
      <UButton
        v-if="chosen.some(publishable)"
        :label="m.bulk.publish(chosen.filter(publishable).length)"
        icon="i-lucide-send"
        size="sm"
        :loading="busy"
        @click="publishMany(chosen.filter(publishable))"
      />
      <UButton
        v-if="chosen.some(publishable)"
        :label="m.bulk.schedule(chosen.filter(publishable).length)"
        icon="i-lucide-calendar-clock"
        variant="outline"
        size="sm"
        :disabled="busy"
        @click="openSchedule(chosen.filter(publishable))"
      />
      <UButton
        v-if="chosen.some(unpublishable)"
        :label="m.bulk.unpublish(chosen.filter(unpublishable).length)"
        icon="i-lucide-eye-off"
        color="error"
        variant="outline"
        size="sm"
        :disabled="busy"
        @click="unpublishing = chosen.filter(unpublishable)"
      />
      <UButton
        v-if="chosen.some(trashable)"
        :label="m.bulk.trash(chosen.filter(trashable).length)"
        icon="i-lucide-trash-2"
        color="error"
        variant="outline"
        size="sm"
        :disabled="busy"
        @click="trashing = chosen.filter(trashable)"
      />
      <UButton
        v-if="chosen.some(restorable)"
        :label="m.bulk.restore(chosen.filter(restorable).length)"
        icon="i-lucide-undo-2"
        size="sm"
        :loading="busy"
        @click="restoreMany(chosen.filter(restorable))"
      />
      <UButton
        v-if="chosen.some(purgeable)"
        :label="m.bulk.purge(chosen.filter(purgeable).length)"
        icon="i-lucide-trash"
        color="error"
        variant="outline"
        size="sm"
        :disabled="busy"
        @click="purging = chosen.filter(purgeable)"
      />
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="m.table.clear"
        @click="selected = []"
      />
    </div>
    <p v-if="truncated" class="px-6 pb-6 text-sm text-muted">
      {{ m.entries.truncated(MOST) }}
    </p>

    <UModal v-model:open="unpublishOpen" :title="m.bulk.unpublishTitle(unpublishing.length)">
      <template #body>
        <p class="text-sm">{{ m.bulk.unpublishBody }}</p>
      </template>
      <template #footer>
        <UButton :label="m.common.cancel" variant="ghost" @click="unpublishing = []" />
        <UButton
          :label="m.bulk.unpublish(unpublishing.length)"
          color="error"
          @click="unpublishMany"
        />
      </template>
    </UModal>

    <UModal v-model:open="trashOpen" :title="m.bulk.trashTitle(trashing.length)">
      <template #body>
        <p class="text-sm">{{ m.bulk.trashBody }}</p>
      </template>
      <template #footer>
        <UButton :label="m.common.keepIt" variant="ghost" @click="trashing = []" />
        <UButton :label="m.bulk.trash(trashing.length)" color="error" @click="trashMany" />
      </template>
    </UModal>

    <UModal v-model:open="purgeOpen" :title="m.bulk.purgeTitle(purging.length)">
      <template #body>
        <p class="text-sm">{{ m.bulk.purgeBody }}</p>
      </template>
      <template #footer>
        <UButton :label="m.common.keepIt" variant="ghost" @click="purging = []" />
        <UButton :label="m.bulk.purge(purging.length)" color="error" @click="purgeMany" />
      </template>
    </UModal>

    <UModal v-model:open="scheduleOpen" :title="m.bulk.scheduleTitle(scheduling.length)">
      <template #body>
        <UFormField
          :label="m.entry.publishAt"
          :help="m.entry.publishAtHelp"
          :error="scheduleError ?? undefined"
        >
          <UInput v-model="publishAt" type="datetime-local" class="w-full" />
        </UFormField>
      </template>
      <template #footer>
        <UButton :label="m.common.cancel" variant="ghost" @click="scheduling = []" />
        <UButton
          :label="m.bulk.schedule(scheduling.length)"
          :disabled="scheduleError !== null"
          @click="publishMany(scheduling, new Date(publishAt).toISOString())"
        />
      </template>
    </UModal>

    <UModal v-model:open="warnedOpen" :title="m.bulk.acknowledgeTitle(warned.length)">
      <template #body>
        <ul class="space-y-4 text-sm">
          <li v-for="{ row, warnings } in warned" :key="row.id">
            <p class="font-medium">{{ row.title }}</p>
            <ul class="mt-1 space-y-1">
              <li v-for="(warning, index) in warnings" :key="index">
                <span class="font-mono text-xs text-muted">{{ warning.contract }}</span>
                {{ warning.message }}
              </li>
            </ul>
          </li>
        </ul>
      </template>
      <template #footer>
        <UButton :label="m.common.cancel" variant="ghost" @click="warned = []" />
        <UButton
          :label="m.entry.publishAnyway"
          color="warning"
          :loading="busy"
          @click="acceptWarnings"
        />
      </template>
    </UModal>
  </Page>
</template>
