<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { useClipboard } from '@vueuse/core'
import Page from '../components/Page.vue'
import { computed } from 'vue'
import type { Output } from '../lib/api.ts'
import { formatDateTime, formatNumber, useMessages } from '../i18n/index.ts'
import { entryPath, STATUS_COLOR, titleOf } from '../lib/entries.ts'
import { databaseSize } from '../lib/database.ts'
import { firstSteps, type TokenOfSite } from '../lib/first-steps.ts'
import { can, me } from '../lib/me.ts'
import { personName } from '../lib/people.ts'
import { admin, operation } from '../lib/queries.ts'
import { api } from '../lib/session.ts'

type Entry = Output<'list_entries'>['entries'][number]

const m = useMessages()
const mcpLine = `claude mcp add --transport http hollware ${window.location.origin}/mcp --header "Authorization: Bearer <token>"`

const owner = computed(() => can(me.value, 'schema:admin'))

const tokensQuery = useQuery({ ...admin<{ tokens: TokenOfSite[] }>('tokens'), enabled: owner })
const peopleQuery = useQuery({
  ...admin<{ people: unknown[]; invitations: unknown[] }>('people'),
  enabled: owner,
})
const databaseQuery = useQuery({ ...admin<{ bytes: number }>('database'), enabled: owner })
const tokens = computed(() => tokensQuery.data.value?.tokens ?? null)
const peopleCount = computed(() =>
  peopleQuery.data.value === undefined
    ? null
    : peopleQuery.data.value.people.length + peopleQuery.data.value.invitations.length,
)
const database = computed(() =>
  databaseQuery.data.value === undefined ? null : databaseSize(databaseQuery.data.value.bytes),
)

const statsQuery = useQuery(operation('content_stats', { days: 30, limit: 8 }))
const reviewsQuery = useQuery(operation('list_reviews', { status: 'pending', limit: 5 }))
const siteQuery = useQuery(operation('describe_site', {}))
const names = computed(
  () => siteQuery.data.value?.site.collections.map((collection) => collection.name) ?? null,
)
const everythingQuery = useQuery(() => ({
  key: ['home', 'entries', ...(names.value ?? [])],
  query: async () =>
    (
      await Promise.all(
        (names.value ?? []).map((collection) =>
          api.call('list_entries', { collection, limit: 50 }),
        ),
      )
    ).flatMap((list) => list.entries),
  enabled: names.value !== null,
}))

const stats = computed(() => statsQuery.data.value ?? null)
const reviews = computed(() => reviewsQuery.data.value?.reviews ?? null)
const everything = computed(() => everythingQuery.data.value ?? null)
const entryCount = computed(() => everything.value?.length ?? null)
const newest = (a: Entry, b: Entry) => b.updatedAt.localeCompare(a.updatedAt)
const drafts = computed(
  () =>
    everything.value
      ?.filter((entry) => entry.status !== 'published' || entry.hasUnpublishedChanges)
      .filter((entry) => !entry.slug.startsWith('audit-'))
      .sort(newest)
      .slice(0, 6) ?? null,
)
const behind = computed(
  () =>
    everything.value
      ?.filter((entry) => entry.translationOutdated === true)
      .sort(newest)
      .slice(0, 6) ?? [],
)
const audit = computed(
  () =>
    everything.value?.filter((entry) => entry.slug.startsWith('audit-')).sort(newest)[0] ?? null,
)

const steps = computed(() =>
  tokens.value === null ||
  peopleCount.value === null ||
  entryCount.value === null ||
  stats.value === null
    ? []
    : firstSteps({
        tokens: tokens.value,
        people: peopleCount.value,
        entries: entryCount.value,
        analytics: stats.value.outcome === 'ok',
        now: new Date().toISOString(),
      }),
)

const { copy } = useClipboard({ legacy: true })
const copyLine = () => copy(mcpLine)

const topViews = computed(() =>
  Math.max(1, ...(stats.value?.pages ?? []).map((page) => page.views)),
)
const totalViews = computed(() =>
  (stats.value?.pages ?? []).reduce((sum, page) => sum + page.views, 0),
)
</script>

<template>
  <Page :title="m.home.title">
    <div class="space-y-8">
      <section
        v-if="steps.some((step) => !step.done)"
        aria-labelledby="start"
        class="space-y-4 rounded-lg border border-default p-5"
      >
        <h2 id="start" class="font-semibold">{{ m.home.start }}</h2>
        <ol :aria-label="m.home.start" class="space-y-4">
          <li v-for="step in steps" :key="step.key" class="flex gap-3">
            <UIcon
              :name="step.done ? 'i-lucide-circle-check' : 'i-lucide-circle'"
              class="mt-0.5 size-4 shrink-0"
              :class="step.done ? 'text-secondary' : 'text-dimmed'"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1 space-y-1.5 text-sm">
              <p>
                <RouterLink :to="step.to" class="font-medium text-highlighted hover:underline">{{
                  m.home.steps[step.key].title
                }}</RouterLink
                ><span class="sr-only">, {{ step.done ? m.home.done : m.home.toDo }}</span>
              </p>
              <p class="text-muted">{{ m.home.steps[step.key].body }}</p>
              <div v-if="step.key === 'agent'" class="flex items-center gap-2">
                <code
                  class="min-w-0 flex-1 truncate rounded-md bg-elevated px-2.5 py-1.5 font-mono text-xs"
                  >{{ mcpLine }}</code
                >
                <UButton
                  :label="m.common.copy"
                  icon="i-lucide-copy"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="copyLine"
                />
              </div>
            </div>
          </li>
        </ol>
      </section>

      <div class="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="read" class="space-y-3 rounded-lg border border-default p-5">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="read" class="font-semibold">{{ m.home.mostRead }}</h2>
            <span
              v-if="stats?.outcome === 'ok'"
              class="font-mono text-sm text-muted tabular-nums"
              >{{ m.home.views(formatNumber(totalViews)) }}</span
            >
          </div>
          <p v-if="stats === null" class="text-sm text-muted">{{ m.common.loading }}</p>
          <div v-else-if="stats.outcome === 'unavailable'" class="space-y-2 text-sm text-muted">
            <p>{{ m.home.noAnalytics }}</p>
            <RouterLink to="/settings/site/analytics" class="text-highlighted underline">{{
              m.home.connectAnalytics
            }}</RouterLink>
          </div>
          <p v-else-if="(stats.pages ?? []).length === 0" class="text-sm text-muted">
            {{ m.home.noViews }}
          </p>
          <ol v-else class="space-y-2">
            <li v-for="page in stats.pages" :key="page.path" class="space-y-1 text-sm">
              <div class="flex items-baseline justify-between gap-3">
                <RouterLink
                  v-if="page.entry !== null"
                  :to="entryPath(page.entry)"
                  class="min-w-0 truncate font-medium hover:underline"
                  >{{ titleOf(page.entry) }}</RouterLink
                >
                <span v-else class="min-w-0 truncate font-mono text-muted">{{ page.path }}</span>
                <span class="font-mono text-muted tabular-nums">{{
                  formatNumber(page.views)
                }}</span>
              </div>
              <div class="h-1 rounded-full bg-elevated" aria-hidden="true">
                <div
                  class="h-1 rounded-full bg-secondary"
                  :style="{ width: `${(page.views / topViews) * 100}%` }"
                />
              </div>
            </li>
          </ol>
        </section>

        <section aria-labelledby="waiting" class="space-y-3 rounded-lg border border-default p-5">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="waiting" class="font-semibold">{{ m.home.waiting }}</h2>
            <RouterLink to="/reviews" class="text-sm text-muted hover:text-highlighted">{{
              m.home.allReviews
            }}</RouterLink>
          </div>
          <p v-if="reviews === null" class="text-sm text-muted">{{ m.common.loading }}</p>
          <p v-else-if="reviews.length === 0" class="text-sm text-muted">
            {{ m.common.nothingWaits }}
          </p>
          <ul v-else class="divide-y divide-default text-sm">
            <li v-for="item in reviews" :key="item.id" class="py-2">
              <RouterLink to="/reviews" class="font-medium hover:underline">{{
                titleOf(item.entry)
              }}</RouterLink>
              <p class="text-muted">
                {{
                  m.home.askedBy(
                    personName(item.requestedBy, item.requestedByName, m.people.formerPerson),
                    formatDateTime(item.requestedAt),
                  )
                }}
              </p>
            </li>
          </ul>
        </section>
      </div>

      <div class="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="drafts" class="space-y-3">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="drafts" class="font-semibold">{{ m.home.unpublished }}</h2>
            <RouterLink to="/entries" class="text-sm text-muted hover:text-highlighted">{{
              m.home.allEntries
            }}</RouterLink>
          </div>
          <p v-if="drafts === null" class="text-sm text-muted">{{ m.common.loading }}</p>
          <p v-else-if="drafts.length === 0" class="text-sm text-muted">
            {{ m.home.allPublished }}
          </p>
          <ul v-else class="divide-y divide-default rounded-lg border border-default text-sm">
            <li v-for="entry in drafts" :key="entry.id" class="flex items-center gap-3 px-4 py-2.5">
              <RouterLink
                :to="entryPath(entry)"
                class="min-w-0 flex-1 truncate font-medium hover:underline"
                >{{ titleOf(entry) }}</RouterLink
              >
              <span class="font-mono text-xs text-muted">{{ entry.locale }}</span>
              <UBadge
                :label="entry.status === 'published' ? m.home.changes : m.status[entry.status]"
                :color="entry.status === 'published' ? 'warning' : STATUS_COLOR[entry.status]"
                variant="subtle"
              />
            </li>
          </ul>
        </section>

        <div v-if="behind.length > 0 || audit !== null" class="space-y-6">
          <section v-if="behind.length > 0" aria-labelledby="behind" class="space-y-3">
            <h2 id="behind" class="font-semibold">{{ m.home.behind }}</h2>
            <ul class="divide-y divide-default rounded-lg border border-default text-sm">
              <li
                v-for="entry in behind"
                :key="entry.id"
                class="flex items-center gap-3 px-4 py-2.5"
              >
                <RouterLink
                  :to="entryPath(entry)"
                  class="min-w-0 flex-1 truncate font-medium hover:underline"
                  >{{ titleOf(entry) }}</RouterLink
                >
                <span class="font-mono text-xs text-muted">{{ entry.locale }}</span>
              </li>
            </ul>
          </section>

          <section v-if="audit !== null" aria-labelledby="audit" class="space-y-3">
            <h2 id="audit" class="font-semibold">{{ m.home.lastAudit }}</h2>
            <RouterLink
              :to="entryPath(audit)"
              class="block rounded-lg border border-default p-4 text-sm hover:bg-elevated"
            >
              <p class="font-medium">{{ titleOf(audit) }}</p>
              <p class="text-muted">{{ m.home.written(formatDateTime(audit.updatedAt)) }}</p>
            </RouterLink>
          </section>
        </div>
      </div>

      <section v-if="database !== null" aria-labelledby="database" class="space-y-1 text-sm">
        <h2 id="database" class="font-semibold">{{ m.home.database }}</h2>
        <p :class="database.near ? 'text-warning' : 'text-muted'">
          {{ m.home.databaseSize(formatNumber(database.megabytes)) }}
        </p>
      </section>
    </div>
  </Page>
</template>
