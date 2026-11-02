<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import Page from '../components/Page.vue'
import { defineShortcuts, useToast } from '@nuxt/ui/composables'
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DiffView from '../components/DiffView.vue'
import VerdictList from '../components/VerdictList.vue'
import { ApiError, type Output } from '../lib/api.ts'
import { formatDateTime, useMessages } from '../i18n/index.ts'
import { titleOf } from '../lib/entries.ts'
import { countOutcomes, runAll } from '../lib/bulk.ts'
import { useBulkReport } from '../lib/bulk-report.ts'
import { nextIndex } from '../lib/entry-list.ts'
import { anchorOf, commentsOn, exclusionOf, indexAfterReload } from '../lib/reviews.ts'
import { operation } from '../lib/queries.ts'
import { api } from '../lib/session.ts'
import { personName } from '../lib/people.ts'
import { agentStatusColor, clientBadge, isAgentComment, managesSite } from '../lib/agents.ts'
import { me } from '../lib/me.ts'
import { pageUrl } from '../lib/site.ts'
import { openPreview } from '../lib/site-preview.ts'

const ReviewPreview = defineAsyncComponent(() => import('../components/ReviewPreview.vue'))

type Review = Output<'list_reviews'>['reviews'][number]
type Detail = Required<Output<'get_review'>>
type Item = Detail['items'][number]
type Verdict = Output<'validate'>['verdict']
type Warning = Verdict['warnings'][number]
type Said = Review['comments'][number]
type ReviewAgent = Review['agents'][number]

const toast = useToast()
const m = useMessages()
const route = useRoute()
const wanted = typeof route.query['review'] === 'string' ? route.query['review'] : null
const listQuery = useQuery(operation('list_reviews', {}))
const reviews = computed(() => listQuery.data.value?.reviews ?? [])
const siteQuery = useQuery(operation('describe_site', {}))
const site = computed(() => siteQuery.data.value?.site ?? null)
const view = ref<'changes' | 'preview'>('changes')
const chosen = ref<Review | null>(null)
const excluded = ref(new Set<string>())
const itemComment = ref<Record<string, { body: string; from: number | null; to: number | null }>>(
  {},
)
const verdict = ref<Verdict | null>(null)
const note = ref('')
const comment = ref('')
const busy = ref(false)
const warnings = ref<Warning[]>([])
const acknowledgeOpen = ref(false)
const pendingAgents = ref<ReviewAgent[]>([])
const overriding = ref(false)
const owner = computed(() => managesSite(me.value))
const pendingAgentsOpen = computed({
  get: () => pendingAgents.value.length > 0,
  set: (value: boolean) => {
    if (!value) pendingAgents.value = []
  },
})

const focused = ref(-1)
const listEl = ref<HTMLElement | null>(null)
const noteOpen = ref(false)

const detailQuery = useQuery(() => {
  const review = chosen.value
  return {
    key: ['review', review?.id ?? null],
    query: async () => {
      if (review === null) return null
      const [read, head] = await Promise.all([
        api.call('get_review', { id: review.id }),
        api.call('get_entry', {
          collection: review.entry.collection,
          locale: review.entry.locale,
          slug: review.entry.slug,
          formats: ['document'],
        }),
      ])
      return {
        detail:
          read.review === undefined || read.items === undefined
            ? null
            : ({ outcome: read.outcome, review: read.review, items: read.items } as Detail),
        document: head.entry?.document ?? null,
        verdict: head.entry?.verdict ?? null,
      }
    },
    enabled: review !== null,
  }
})
const detail = computed(() => detailQuery.data.value?.detail ?? null)
const askedDocument = computed(() => detailQuery.data.value?.document ?? null)
watch(
  () => detailQuery.data.value,
  (read) => {
    verdict.value = read?.verdict ?? null
  },
)

const visibility = useDocumentVisibility()
useIntervalFn(() => {
  if (visibility.value !== 'visible') return
  void listQuery.refetch()
  if (chosen.value !== null) void detailQuery.refetch()
}, 15_000)

async function list() {
  await listQuery.refetch()
}

function reconcile() {
  const previous = focused.value
  const open = new Set(reviews.value.map((review) => review.id))
  picked.value = new Set([...picked.value].filter((id) => open.has(id)))
  const index = indexAfterReload(
    chosen.value?.id ?? wanted,
    previous,
    reviews.value.map((review) => review.id),
  )
  const next = reviews.value[index]
  if (next === undefined) {
    focused.value = -1
    chosen.value = null
  } else if (next.id !== chosen.value?.id) {
    choose(next, index)
  } else {
    focused.value = index
    chosen.value = next
  }
}

const views = computed(() => [
  { label: m.value.reviews.changes, value: 'changes', slot: 'changes' as const },
  { label: m.value.reviews.preview, value: 'preview', slot: 'preview' as const },
])

const onSite = computed(() => {
  const review = chosen.value
  const routes = site.value?.collections.find(
    (collection) => collection.name === review?.entry.collection,
  )?.routes
  return review === null || routes === undefined
    ? null
    : pageUrl(site.value?.url ?? null, routes, review.entry.locale, review.entry.slug)
})

async function openOnSite() {
  if (chosen.value === null) return
  try {
    const result = await openPreview(api, chosen.value.entry.id, (url) => {
      window.open(url, '_blank', 'noopener')
    })
    if (result === 'no_url') {
      toast.add({ title: m.value.entry.notPreviewed, description: m.value.entry.previewNoUrl })
    }
  } catch (error) {
    report(error, m.value.entry.notPreviewed)
  }
}

const reportBulk = useBulkReport()
const picked = ref(new Set<string>())
const pickedReviews = computed(() => reviews.value.filter((review) => picked.value.has(review.id)))
const allPicked = computed(() =>
  picked.value.size === 0
    ? false
    : picked.value.size === reviews.value.length
      ? true
      : ('indeterminate' as const),
)
function pick(id: string, on: boolean | 'indeterminate') {
  const next = new Set(picked.value)
  if (on === true) next.add(id)
  else next.delete(id)
  picked.value = next
}
function pickAll(on: boolean | 'indeterminate') {
  picked.value = new Set(on === true ? reviews.value.map((review) => review.id) : [])
}
const titleOfReview = (review: Review) => titleOf(review.entry)

const warnedMany = ref<{ review: Review; warnings: Warning[] }[]>([])
const warnedManyOpen = computed({
  get: () => warnedMany.value.length > 0,
  set: (value: boolean) => {
    if (!value) warnedMany.value = []
  },
})
const askingMany = ref(false)
const manyNote = ref('')

async function approveMany(
  chosenReviews: readonly Review[],
  acknowledged: ReadonlyMap<string, readonly Warning[]> = new Map(),
) {
  busy.value = true
  warnedMany.value = []
  try {
    const results = await runAll(chosenReviews, (review) =>
      api.call('approve_review', {
        id: review.id,
        acknowledgeWarnings: (acknowledged.get(review.id) ?? []).map(({ contract, path }) => ({
          contract,
          path,
        })),
      }),
    )
    reportBulk(countOutcomes(results))
    warnedMany.value = results.flatMap((result) =>
      'answer' in result && result.answer.outcome === 'needs_acknowledgement'
        ? [{ review: result.item, warnings: result.answer.verdict?.warnings ?? [] }]
        : [],
    )
    await list()
  } finally {
    busy.value = false
  }
}

async function acceptManyWarnings() {
  const accepted = new Map(warnedMany.value.map(({ review, warnings }) => [review.id, warnings]))
  await approveMany(
    warnedMany.value.map(({ review }) => review),
    accepted,
  )
}

async function askChangesMany() {
  const chosenReviews = pickedReviews.value
  const body = manyNote.value
  askingMany.value = false
  busy.value = true
  try {
    reportBulk(
      countOutcomes(
        await runAll(chosenReviews, (review) =>
          api.call('request_changes', { id: review.id, note: body }),
        ),
      ),
    )
    manyNote.value = ''
    await list()
  } finally {
    busy.value = false
  }
}

function choose(review: Review, index = reviews.value.indexOf(review)) {
  chosen.value = review
  overriding.value = false
  focused.value = index
  note.value = ''
  comment.value = ''
  excluded.value = new Set()
  itemComment.value = {}
}

const items = computed(() => detail.value?.items ?? [])
const comments = computed(() => detail.value?.review.comments ?? chosen.value?.comments ?? [])
const reviewAgents = computed(() => detail.value?.review.agents ?? chosen.value?.agents ?? [])

function agentLabel(agent: ReviewAgent): string {
  return [
    agent.name,
    m.value.reviews.agentStatus[agent.status],
    ...(agent.required ? [m.value.reviews.agentRequired] : []),
  ].join(' · ')
}

function authorOf(said: Said): string {
  const name = personName(said.author, said.authorName, m.value.people.formerPerson)
  return isAgentComment(said) ? m.value.reviews.agentAuthor(name) : name
}

function exclude(entryId: string, on: boolean | 'indeterminate') {
  const next = new Set(excluded.value)
  if (on === true) next.add(entryId)
  else next.delete(entryId)
  excluded.value = next
}

function draftOf(item: Item) {
  const id = item.entry.id
  itemComment.value[id] ??= { body: '', from: null, to: null }
  return itemComment.value[id]
}

async function commentItem(item: Item) {
  const draft = draftOf(item)
  if (chosen.value === null || draft.body.trim() === '') return
  busy.value = true
  try {
    const answer = await api.call('comment_review', {
      id: chosen.value.id,
      body: draft.body,
      ...anchorOf(item.entry.id, draft.from, draft.to),
    })
    if (answer.outcome === 'commented') {
      itemComment.value[item.entry.id] = { body: '', from: null, to: null }
    } else {
      toast.add({ title: m.value.reviews.closed, color: 'warning' })
      await list()
    }
  } catch (error) {
    report(error, m.value.reviews.notSent)
  } finally {
    busy.value = false
  }
}

function report(error: unknown, title: string) {
  const description = error instanceof ApiError ? `${error.message} ${error.fix}` : String(error)
  toast.add({ title, description, color: 'error' })
}

async function approve(acknowledged: readonly Warning[] = [], override = overriding.value) {
  if (chosen.value === null) return
  busy.value = true
  acknowledgeOpen.value = false
  pendingAgents.value = []
  overriding.value = override
  try {
    const answer = await api.call('approve_review', {
      id: chosen.value.id,
      acknowledgeWarnings: acknowledged.map(({ contract, path }) => ({ contract, path })),
      override,
      exclude: exclusionOf(
        excluded.value,
        items.value.map((item) => item.entry.id),
      ),
    })
    switch (answer.outcome) {
      case 'published':
        toast.add({ title: m.value.reviews.approved, color: 'success' })
        await list()
        break
      case 'needs_acknowledgement':
        warnings.value = answer.verdict?.warnings ?? []
        acknowledgeOpen.value = true
        break
      case 'agents_pending':
        pendingAgents.value = answer.agents ?? []
        break
      case 'blocked':
        verdict.value = answer.verdict ?? verdict.value
        toast.add({
          title: m.value.reviews.blocked,
          description: m.value.reviews.errorsNow,
          color: 'error',
        })
        break
      case 'conflict':
        toast.add({ title: m.value.reviews.moved, color: 'warning' })
        break
      case 'not_pending':
      case 'not_found':
        toast.add({ title: m.value.reviews.closed, color: 'warning' })
        await list()
        break
    }
    if (answer.outcome !== 'needs_acknowledgement') overriding.value = false
  } catch (error) {
    overriding.value = false
    report(error, m.value.reviews.notApproved)
  } finally {
    busy.value = false
  }
}

async function addComment() {
  if (chosen.value === null || comment.value.trim() === '') return
  busy.value = true
  try {
    const answer = await api.call('comment_review', { id: chosen.value.id, body: comment.value })
    if (answer.outcome === 'commented') {
      comment.value = ''
    } else {
      toast.add({ title: m.value.reviews.closed, color: 'warning' })
      await list()
    }
  } catch (error) {
    report(error, m.value.reviews.notSent)
  } finally {
    busy.value = false
  }
}

async function reject() {
  if (chosen.value === null || note.value.trim() === '') return
  noteOpen.value = false
  busy.value = true
  try {
    const answer = await api.call('reject_review', { id: chosen.value.id, reason: note.value })
    toast.add({
      title: answer.outcome === 'rejected' ? m.value.reviews.rejected : m.value.reviews.closed,
      color: answer.outcome === 'rejected' ? 'success' : 'warning',
    })
    await list()
  } catch (error) {
    report(error, m.value.reviews.notSent)
  } finally {
    busy.value = false
  }
}

async function requestChanges() {
  if (chosen.value === null || note.value.trim() === '') return
  noteOpen.value = false
  busy.value = true
  try {
    const answer = await api.call('request_changes', { id: chosen.value.id, note: note.value })
    toast.add({
      title:
        answer.outcome === 'changes_requested'
          ? m.value.reviews.changesRequested
          : m.value.reviews.closed,
      color: answer.outcome === 'changes_requested' ? 'success' : 'warning',
    })
    await list()
  } catch (error) {
    report(error, m.value.reviews.notSent)
  } finally {
    busy.value = false
  }
}

async function move(step: 1 | -1) {
  const index = nextIndex(focused.value, reviews.value.length, step)
  const review = reviews.value[index]
  if (review === undefined) return
  choose(review, index)
  await nextTick()
  listEl.value?.querySelector<HTMLElement>(`[data-index="${index}"] button`)?.focus()
}

watch(
  () => listQuery.data.value,
  () => reconcile(),
  { immediate: true },
)

const dialogOpen = computed(
  () =>
    noteOpen.value ||
    acknowledgeOpen.value ||
    askingMany.value ||
    warnedManyOpen.value ||
    pendingAgentsOpen.value,
)

defineShortcuts(
  computed(() =>
    dialogOpen.value
      ? {}
      : {
          j: () => void move(1),
          k: () => void move(-1),
          arrowdown: () => void move(1),
          arrowup: () => void move(-1),
          x: () => {
            const review = reviews.value[focused.value]
            if (review !== undefined) pick(review.id, !picked.value.has(review.id))
          },
          escape:
            picked.value.size > 0
              ? () => {
                  picked.value = new Set()
                }
              : undefined,
          a: () => {
            if (chosen.value !== null && !busy.value) void approve()
          },
          r: () => {
            if (chosen.value !== null) noteOpen.value = true
          },
        },
  ),
)
</script>

<template>
  <Page :title="m.reviews.title" flush>
    <div class="flex min-h-0 flex-1">
      <section
        ref="listEl"
        :aria-label="m.reviews.pending"
        class="w-full shrink-0 overflow-y-auto border-e border-default sm:w-80 lg:w-96"
        :class="chosen !== null ? 'max-sm:hidden' : undefined"
      >
        <h2
          class="sticky top-0 z-10 flex items-center gap-2 border-b border-default bg-elevated/70 px-4 py-1.5 text-xs font-medium text-toned backdrop-blur"
        >
          <UCheckbox
            v-if="reviews.length > 0"
            :model-value="allPicked"
            :aria-label="m.bulk.selectReviews"
            @update:model-value="pickAll"
          />
          <UIcon name="i-lucide-inbox" class="size-3.5 text-secondary" />
          <span>{{ m.reviews.pending }}</span>
          <span class="text-muted">{{ reviews.length }}</span>
        </h2>
        <div
          v-if="pickedReviews.length > 0"
          role="toolbar"
          :aria-label="m.table.bulk"
          class="flex flex-wrap items-center gap-2 border-b border-default bg-elevated px-4 py-2"
        >
          <span class="w-full text-sm font-medium tabular-nums">{{
            m.table.selected(pickedReviews.length)
          }}</span>
          <UButton
            :label="m.bulk.approve(pickedReviews.length)"
            color="success"
            size="sm"
            :loading="busy"
            @click="approveMany(pickedReviews)"
          />
          <UButton
            :label="m.bulk.askChanges(pickedReviews.length)"
            color="warning"
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="askingMany = true"
          />
          <p class="w-full text-xs text-muted">{{ m.bulk.approveSeparately }}</p>
        </div>
        <p v-if="reviews.length === 0" class="px-4 py-10 text-sm text-muted">
          {{ m.common.nothingWaits }}
        </p>
        <ul v-else role="list">
          <li
            v-for="(review, index) in reviews"
            :key="review.id"
            :data-index="index"
            class="group flex items-start gap-3 border-b border-default/60 px-4 py-2.5 text-sm hover:bg-elevated/50"
            :class="{
              'bg-elevated/60': chosen?.id === review.id,
              'bg-secondary/5': picked.has(review.id),
            }"
          >
            <UCheckbox
              :model-value="picked.has(review.id)"
              :aria-label="m.table.selectRow(titleOfReview(review))"
              class="mt-0.5 transition-opacity"
              :class="
                picked.size > 0 || chosen?.id === review.id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
              "
              @update:model-value="(on: boolean | 'indeterminate') => pick(review.id, on)"
            />
            <button
              type="button"
              class="block min-w-0 flex-1 text-left focus:outline-none"
              :aria-current="chosen?.id === review.id ? 'true' : undefined"
              @click="choose(review, index)"
            >
              <span class="flex items-baseline gap-2">
                <span class="min-w-0 flex-1 truncate font-medium text-highlighted">{{
                  titleOfReview(review)
                }}</span>
                <UBadge
                  v-if="review.items > 1"
                  :label="m.reviews.entries(review.items)"
                  variant="subtle"
                  size="sm"
                  class="shrink-0"
                />
                <span
                  v-if="review.comments.length > 0"
                  class="flex shrink-0 items-center gap-1 text-xs text-muted tabular-nums"
                >
                  <UIcon name="i-lucide-message-square" class="size-3" aria-hidden="true" />
                  {{ review.comments.length }}
                </span>
              </span>
              <span class="mt-0.5 block truncate text-xs text-muted">
                {{ review.entry.collection }} ·
                {{
                  m.reviews.requested(
                    review.entry.locale,
                    personName(review.requestedBy, review.requestedByName, m.people.formerPerson),
                    formatDateTime(review.requestedAt),
                  )
                }}
              </span>
            </button>
          </li>
        </ul>
      </section>

      <section
        v-if="chosen !== null"
        :aria-label="m.reviews.review"
        class="min-w-0 flex-1 overflow-y-auto"
      >
        <div
          class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-default bg-default/90 px-4 py-2.5 backdrop-blur sm:px-6"
        >
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="sm"
            class="sm:hidden"
            :aria-label="m.reviews.back"
            @click="chosen = null"
          />
          <h2 class="min-w-0 flex-1 truncate font-semibold max-sm:order-first max-sm:basis-full">
            {{ titleOfReview(chosen) }}
          </h2>
          <UButton
            :label="m.reviews.askChanges"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="noteOpen = true"
          >
            <template #trailing><UKbd value="r" class="max-sm:hidden" /></template>
          </UButton>
          <UButton
            :label="items.length > 1 ? m.reviews.approveAll : m.reviews.approve"
            color="success"
            size="sm"
            :loading="busy"
            @click="approve()"
          >
            <template #trailing><UKbd value="a" class="max-sm:hidden" /></template>
          </UButton>
        </div>
        <div class="space-y-6 px-4 py-6 sm:px-6">
          <p class="text-sm text-muted">
            {{
              m.reviews.requested(
                chosen.entry.locale,
                personName(chosen.requestedBy, chosen.requestedByName, m.people.formerPerson),
                formatDateTime(chosen.requestedAt),
              )
            }}
          </p>
          <section
            v-if="reviewAgents.length > 0"
            :aria-label="m.reviews.agents"
            class="flex flex-wrap items-center gap-2 text-sm"
          >
            <span class="text-xs font-medium text-toned">{{ m.reviews.agents }}</span>
            <UBadge
              v-for="agent in reviewAgents"
              :key="agent.name"
              :color="agentStatusColor(agent.status)"
              variant="subtle"
              size="sm"
              icon="i-lucide-bot"
              :label="agentLabel(agent)"
            />
          </section>
          <UTabs v-model="view" :items="views" variant="link">
            <template #changes>
              <div class="space-y-8 pt-4">
                <section
                  v-for="item in items"
                  :key="item.entry.id"
                  :aria-label="titleOf(item.entry)"
                  class="space-y-3"
                  :class="excluded.has(item.entry.id) ? 'opacity-60' : undefined"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="min-w-0 flex-1 truncate text-sm font-semibold">
                      {{ titleOf(item.entry) }}
                    </h3>
                    <UBadge
                      :label="
                        item.action === 'unpublish' ? m.reviews.unpublishes : m.reviews.publishes
                      "
                      :color="item.action === 'unpublish' ? 'warning' : 'neutral'"
                      variant="subtle"
                      size="sm"
                    />
                    <UCheckbox
                      v-if="items.length > 1"
                      :model-value="excluded.has(item.entry.id)"
                      :label="m.reviews.exclude"
                      @update:model-value="
                        (on: boolean | 'indeterminate') => exclude(item.entry.id, on)
                      "
                    />
                  </div>
                  <p class="text-sm text-muted">{{ m.reviews.sides(item.published !== null) }}</p>
                  <DiffView
                    v-if="item.diff !== ''"
                    :original="item.published ?? ''"
                    :modified="item.proposed ?? ''"
                  />
                  <p v-else class="text-sm text-muted">{{ m.reviews.noDiff }}</p>
                  <ol v-if="commentsOn(comments, item.entry.id).length > 0" class="space-y-2">
                    <li
                      v-for="said in commentsOn(comments, item.entry.id)"
                      :key="said.id"
                      class="rounded-lg border border-default bg-elevated/30 p-3 text-sm"
                    >
                      <p class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span class="font-medium text-toned">{{ authorOf(said) }}</span>
                        <span v-if="said.lines !== null">
                          · {{ m.reviews.lines(said.lines.from, said.lines.to) }}
                        </span>
                        · {{ formatDateTime(said.at) }}
                      </p>
                      <p class="mt-1 whitespace-pre-wrap">{{ said.body }}</p>
                    </li>
                  </ol>
                  <form
                    v-if="item.proposed !== null"
                    class="flex flex-wrap items-end gap-2"
                    @submit.prevent="commentItem(item)"
                  >
                    <UFormField
                      :label="m.reviews.commentEntry(titleOf(item.entry))"
                      class="min-w-0 flex-1 basis-full"
                    >
                      <UTextarea v-model="draftOf(item).body" class="w-full" :rows="1" autoresize />
                    </UFormField>
                    <UFormField :label="m.reviews.lineFrom">
                      <UInputNumber v-model="draftOf(item).from" :min="1" class="w-28" />
                    </UFormField>
                    <UFormField :label="m.reviews.lineTo">
                      <UInputNumber v-model="draftOf(item).to" :min="1" class="w-28" />
                    </UFormField>
                    <UButton
                      type="submit"
                      :label="m.reviews.commentHere"
                      variant="outline"
                      size="sm"
                      :loading="busy"
                      :disabled="draftOf(item).body.trim() === ''"
                    />
                  </form>
                </section>
              </div>
            </template>
            <template #preview>
              <div class="space-y-4 pt-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm text-muted">{{ m.reviews.previewHelp }}</p>
                  <UButton
                    v-if="onSite !== null"
                    :label="m.reviews.openOnSite"
                    icon="i-lucide-external-link"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    @click="openOnSite"
                  />
                </div>
                <ReviewPreview v-if="askedDocument !== null" :document="askedDocument" />
                <p v-else class="text-sm text-muted">{{ m.reviews.nothingToShow }}</p>
              </div>
            </template>
          </UTabs>
          <VerdictList :verdict="verdict" />
          <section aria-labelledby="comments" class="space-y-3">
            <h3 id="comments" class="text-sm font-semibold">{{ m.reviews.comments }}</h3>
            <p v-if="commentsOn(comments, null).length === 0" class="text-sm text-muted">
              {{ m.reviews.noComments }}
            </p>
            <ol v-else class="space-y-3">
              <li
                v-for="item in commentsOn(comments, null)"
                :key="item.id"
                class="rounded-lg border border-default bg-elevated/30 p-3 text-sm"
              >
                <p class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span class="font-medium text-toned">{{ authorOf(item) }}</span>
                  <UBadge
                    v-if="clientBadge(item) !== null"
                    :label="clientBadge(item) ?? ''"
                    variant="subtle"
                    size="sm"
                  />
                  · {{ formatDateTime(item.at) }}
                </p>
                <p class="mt-1 whitespace-pre-wrap">{{ item.body }}</p>
              </li>
            </ol>
            <form class="space-y-2" @submit.prevent="addComment">
              <UFormField :label="m.reviews.comment">
                <UTextarea v-model="comment" class="w-full" :rows="2" autoresize />
              </UFormField>
              <UButton
                type="submit"
                :label="m.reviews.comment"
                variant="outline"
                size="sm"
                :loading="busy"
                :disabled="comment.trim() === ''"
              />
            </form>
          </section>
        </div>
      </section>
      <div
        v-else-if="reviews.length > 0"
        class="hidden min-w-0 flex-1 items-center justify-center p-8 text-sm text-muted sm:flex"
      >
        {{ m.reviews.choose }}
      </div>

      <UModal v-model:open="noteOpen" :title="m.reviews.noteTitle">
        <template #body>
          <UFormField :label="m.reviews.whatToChange" :help="m.reviews.whatToChangeHelp">
            <UTextarea v-model="note" class="w-full" :rows="3" autofocus />
          </UFormField>
        </template>
        <template #footer>
          <UButton :label="m.common.cancel" variant="ghost" @click="noteOpen = false" />
          <UButton
            :label="m.reviews.reject"
            color="error"
            variant="outline"
            :loading="busy"
            :disabled="note.trim() === ''"
            @click="reject"
          />
          <UButton
            :label="m.reviews.askChanges"
            color="warning"
            :loading="busy"
            :disabled="note.trim() === ''"
            @click="requestChanges"
          />
        </template>
      </UModal>

      <UModal v-model:open="warnedManyOpen" :title="m.bulk.approveTitle(warnedMany.length)">
        <template #body>
          <ul class="space-y-4 text-sm">
            <li v-for="{ review, warnings: list } in warnedMany" :key="review.id">
              <p class="font-medium">{{ titleOfReview(review) }}</p>
              <ul class="mt-1 space-y-1">
                <li v-for="(warning, index) in list" :key="index">
                  <span class="font-mono text-xs text-muted">{{ warning.contract }}</span>
                  {{ warning.message }}
                </li>
              </ul>
            </li>
          </ul>
        </template>
        <template #footer>
          <UButton :label="m.common.cancel" variant="ghost" @click="warnedMany = []" />
          <UButton
            :label="m.reviews.approveAnyway"
            color="warning"
            :loading="busy"
            @click="acceptManyWarnings"
          />
        </template>
      </UModal>

      <UModal v-model:open="askingMany" :title="m.bulk.askChangesTitle(pickedReviews.length)">
        <template #body>
          <UFormField :label="m.reviews.whatToChange" :help="m.bulk.askChangesHelp">
            <UTextarea v-model="manyNote" class="w-full" :rows="3" />
          </UFormField>
        </template>
        <template #footer>
          <UButton :label="m.common.cancel" variant="ghost" @click="askingMany = false" />
          <UButton
            :label="m.bulk.askChanges(pickedReviews.length)"
            color="warning"
            :disabled="manyNote.trim() === ''"
            @click="askChangesMany"
          />
        </template>
      </UModal>

      <UModal v-model:open="pendingAgentsOpen" :title="m.reviews.agentsPendingTitle">
        <template #body>
          <div class="space-y-3 text-sm">
            <p>{{ m.reviews.agentsPendingBody }}</p>
            <ul class="space-y-1">
              <li v-for="agent in pendingAgents" :key="agent.name" class="flex items-center gap-2">
                <span class="font-mono">{{ agent.name }}</span>
                <UBadge
                  :color="agentStatusColor(agent.status)"
                  :label="m.reviews.agentStatus[agent.status]"
                  variant="subtle"
                  size="sm"
                />
              </li>
            </ul>
            <p class="text-muted">
              {{ owner ? m.reviews.agentsPendingOwner : m.reviews.agentsPendingWait }}
            </p>
          </div>
        </template>
        <template #footer>
          <UButton :label="m.common.cancel" variant="ghost" @click="pendingAgents = []" />
          <UButton
            v-if="owner"
            :label="m.reviews.approveAnyway"
            color="warning"
            :loading="busy"
            @click="approve([], true)"
          />
        </template>
      </UModal>

      <UModal v-model:open="acknowledgeOpen" :title="m.reviews.approveTitle">
        <template #body>
          <ul class="space-y-2 text-sm">
            <li v-for="(warning, index) in warnings" :key="index">
              <span class="font-mono text-xs text-muted">{{ warning.contract }}</span>
              <p>{{ warning.message }}</p>
              <p class="text-muted">{{ warning.fix }}</p>
            </li>
          </ul>
        </template>
        <template #footer>
          <UButton :label="m.common.cancel" variant="ghost" @click="acknowledgeOpen = false" />
          <UButton :label="m.reviews.approveAnyway" color="warning" @click="approve(warnings)" />
        </template>
      </UModal>
    </div>
  </Page>
</template>
