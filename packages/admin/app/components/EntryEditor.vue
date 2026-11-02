<script setup lang="ts">
import { parseForEditing, stringifyBody } from '@hollware/core'
import type { DropdownMenuItem, EditorToolbarItem } from '@nuxt/ui'
import type { Editor, JSONContent } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import type { Node as ComarkNode } from 'comark'
import { computed, provide, ref, shallowRef, toRef, useTemplateRef, watch } from 'vue'
import { useMessages } from '../i18n/index.ts'
import type { Output } from '../lib/api.ts'
import { customHandlers, slashItems, type SlashComponent } from '../lib/editor/blocks.ts'
import {
  componentContent,
  COMPONENTS_KEY,
  type ComponentDefinition,
} from '../lib/editor/components.ts'
import { editsLosslessly, fromEditor, toEditor } from '../lib/editor/convert.ts'
import {
  Callout,
  COMARK_EXTENSIONS,
  ComarkBlock,
  ComarkComponent,
  imageWithAssets,
  STARTER_KIT,
} from '../lib/editor/nodes.ts'
import { api } from '../lib/session.ts'
import CalloutView from './editor/CalloutView.vue'
import ComponentView from './editor/ComponentView.vue'
import ImagePicker from './editor/ImagePicker.vue'
import { needsAssets } from '../lib/images.ts'
import RawView from './editor/RawView.vue'

type Asset = Output<'list_assets'>['assets'][number]

const props = defineProps<{
  body: string
  components: readonly ComponentDefinition[]
  readonly?: boolean
}>()
const emit = defineEmits<{ 'update:body': [body: string]; lossy: [] }>()

const m = useMessages()
provide(COMPONENTS_KEY, toRef(props, 'components'))

const content = shallowRef<JSONContent | null>(null)
const assets = new Map<string, string>()
const pickerOpen = ref(false)
const editorRef = shallowRef<Editor | null>(null)
const slashComponents = ref<SlashComponent[]>([])
let emitted: string | null = null
let opened: readonly ComarkNode[] = []
let version = 0

const viewed = (node: typeof Callout, view: Parameters<typeof VueNodeViewRenderer>[0]) =>
  node.extend({ addNodeView: () => VueNodeViewRenderer(view) })

const extensions = [
  imageWithAssets((src) => assets.get(src) ?? src),
  ...COMARK_EXTENSIONS.map((extension) => {
    if (extension.name === Callout.name) return viewed(Callout, CalloutView)
    if (extension.name === ComarkComponent.name) return viewed(ComarkComponent, ComponentView)
    if (extension.name === ComarkBlock.name) return viewed(ComarkBlock, RawView)
    return extension
  }),
]

async function open(body: string) {
  const loading = ++version
  if (needsAssets(body, assets)) {
    const listed: Asset[] = (await api.call('list_assets', { limit: 100 })).assets
    for (const asset of listed) assets.set(asset.reference, asset.url)
  }
  const document = await parseForEditing(body)
  if (loading !== version) return
  opened = document.nodes
  content.value = toEditor(document.nodes)
}

watch(
  () => props.body,
  (body) => {
    if (body !== emitted) void open(body)
  },
  { immediate: true },
)

watch(
  () => props.components,
  async (components) => {
    slashComponents.value = await Promise.all(
      components.map(async (component) => ({
        name: component.name,
        description: component.description,
        content: componentContent(
          component.name,
          component.example === null ? [] : (await parseForEditing(component.example)).nodes,
        ),
      })),
    )
  },
  { immediate: true },
)

const stringify = (nodes: ComarkNode[]) => stringifyBody({ nodes, frontmatter: {}, meta: {} })

const ueditor = useTemplateRef<{ editor: Editor | undefined }>('ueditor')
watch(
  () => ueditor.value?.editor,
  async (editor) => {
    editorRef.value = editor ?? null
    if (editor !== undefined && !(await editsLosslessly(opened, editor.getJSON(), stringify))) {
      emit('lossy')
    }
  },
)

let writing = Promise.resolve()
function changed(json: unknown) {
  const doc = json as JSONContent
  writing = writing.then(async () => {
    const body = await stringify(fromEditor(doc))
    emitted = body
    emit('update:body', body)
  })
}

const handlers = customHandlers(() => {
  pickerOpen.value = true
})

function insertImage(image: { src: string; alt: string; url: string }) {
  if (image.url !== image.src) assets.set(image.src, image.url)
  editorRef.value?.chain().focus().setImage({ src: image.src, alt: image.alt }).run()
}

const slash = computed(() =>
  slashItems(
    {
      blocks: m.value.editor.blocks,
      basics: m.value.editor.groups.basics,
      media: m.value.editor.groups.media,
      components: m.value.editor.groups.components,
      componentHelp: (description) => description ?? m.value.editor.component.insert,
    },
    slashComponents.value,
  ),
)

const toolbar = computed<EditorToolbarItem[][]>(() => [
  [
    {
      icon: 'i-lucide-pilcrow',
      'aria-label': m.value.editor.toolbar.turnInto,
      tooltip: { text: m.value.editor.toolbar.turnInto },
      content: { align: 'start' },
      items: [
        { kind: 'paragraph', label: m.value.editor.blocks.text, icon: 'i-lucide-type' },
        {
          kind: 'heading',
          level: 1,
          label: m.value.editor.blocks.heading1,
          icon: 'i-lucide-heading-1',
        },
        {
          kind: 'heading',
          level: 2,
          label: m.value.editor.blocks.heading2,
          icon: 'i-lucide-heading-2',
        },
        {
          kind: 'heading',
          level: 3,
          label: m.value.editor.blocks.heading3,
          icon: 'i-lucide-heading-3',
        },
        { kind: 'bulletList', label: m.value.editor.blocks.bullets, icon: 'i-lucide-list' },
        {
          kind: 'orderedList',
          label: m.value.editor.blocks.numbered,
          icon: 'i-lucide-list-ordered',
        },
        { kind: 'taskList', label: m.value.editor.blocks.todo, icon: 'i-lucide-list-checks' },
        { kind: 'blockquote', label: m.value.editor.blocks.quote, icon: 'i-lucide-text-quote' },
        { kind: 'codeBlock', label: m.value.editor.blocks.code, icon: 'i-lucide-square-code' },
      ],
    },
  ],
  [
    {
      kind: 'mark',
      mark: 'bold',
      icon: 'i-lucide-bold',
      'aria-label': m.value.editor.toolbar.bold,
      tooltip: { text: m.value.editor.toolbar.bold, kbds: ['meta', 'b'] },
    },
    {
      kind: 'mark',
      mark: 'italic',
      icon: 'i-lucide-italic',
      'aria-label': m.value.editor.toolbar.italic,
      tooltip: { text: m.value.editor.toolbar.italic, kbds: ['meta', 'i'] },
    },
    {
      kind: 'mark',
      mark: 'strike',
      icon: 'i-lucide-strikethrough',
      'aria-label': m.value.editor.toolbar.strike,
      tooltip: { text: m.value.editor.toolbar.strike },
    },
    {
      kind: 'mark',
      mark: 'code',
      icon: 'i-lucide-code',
      'aria-label': m.value.editor.toolbar.code,
      tooltip: { text: m.value.editor.toolbar.code, kbds: ['meta', 'e'] },
    },
  ],
  [{ slot: 'link' as const, icon: 'i-lucide-link', 'aria-label': m.value.editor.toolbar.link }],
])

const link = ref('')
function openLink(editor: Editor, isOpen: boolean) {
  if (isOpen) link.value = String(editor.getAttributes('link')['href'] ?? '')
}
function applyLink(editor: Editor) {
  const href = link.value.trim()
  const chain = editor.chain().focus().extendMarkRange('link')
  if (href === '') chain.unsetLink().run()
  else chain.setLink({ href }).run()
}

type Handlers = Record<
  string,
  { execute: (editor: Editor, cmd?: unknown) => { run: () => boolean } } | undefined
>

function blockMenu(editor: Editor, provided: Handlers, pos: number): DropdownMenuItem[][] {
  const run = (kind: string) => provided[kind]?.execute(editor, { kind, pos }).run()
  return [
    [
      {
        label: m.value.editor.block.duplicate,
        icon: 'i-lucide-copy',
        onSelect: () => run('duplicate'),
      },
      {
        label: m.value.editor.block.moveUp,
        icon: 'i-lucide-arrow-up',
        onSelect: () => run('moveUp'),
      },
      {
        label: m.value.editor.block.moveDown,
        icon: 'i-lucide-arrow-down',
        onSelect: () => run('moveDown'),
      },
    ],
    [
      {
        label: m.value.editor.block.delete,
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => run('delete'),
      },
    ],
  ]
}

const blockAt = ref(0)
</script>

<template>
  <div class="hw-editor">
    <UEditor
      v-if="content !== null"
      ref="ueditor"
      v-slot="{ editor, handlers: provided }"
      :model-value="content"
      content-type="json"
      :starter-kit="STARTER_KIT"
      :image="false"
      :mention="false"
      :extensions="extensions"
      :handlers="handlers"
      :placeholder="m.editor.placeholder"
      :editable="props.readonly !== true"
      :editor-props="{ attributes: { 'aria-label': m.editor.body } }"
      class="min-h-[50vh]"
      :ui="{ base: 'ps-16 pe-2 sm:ps-16 sm:pe-2' }"
      @update:model-value="changed"
    >
      <UEditorToolbar
        :editor="editor"
        :items="toolbar"
        layout="bubble"
        :aria-label="m.editor.toolbar.label"
      >
        <template #link>
          <UPopover @update:open="(isOpen: boolean) => openLink(editor, isOpen)">
            <UButton
              icon="i-lucide-link"
              color="neutral"
              :variant="editor.isActive('link') ? 'soft' : 'ghost'"
              size="sm"
              :aria-label="m.editor.toolbar.link"
            />
            <template #content>
              <form class="flex w-80 gap-2 p-2" @submit.prevent="applyLink(editor)">
                <UInput
                  v-model="link"
                  autofocus
                  class="flex-1"
                  size="sm"
                  :placeholder="m.editor.toolbar.linkPlaceholder"
                  :aria-label="m.editor.toolbar.link"
                />
                <UButton type="submit" size="sm" :label="m.editor.apply" />
              </form>
            </template>
          </UPopover>
        </template>
      </UEditorToolbar>
      <UEditorSuggestionMenu :editor="editor" :items="slash" />
      <UEditorDragHandle v-slot="{ ui, onClick }" :editor="editor">
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="ui.handle?.()"
          :aria-label="m.editor.block.insert"
          @click="
            () => {
              const node = onClick?.()
              ;(provided as Handlers)['suggestion']?.execute(editor, { pos: node?.pos }).run()
            }
          "
        />
        <UDropdownMenu
          :items="blockMenu(editor, provided as Handlers, blockAt)"
          :content="{ side: 'left' }"
          @update:open="(isOpen: boolean) => isOpen && (blockAt = onClick?.()?.pos ?? 0)"
        >
          <UButton
            icon="i-lucide-grip-vertical"
            color="neutral"
            variant="ghost"
            size="sm"
            :class="ui.handle?.()"
            :aria-label="m.editor.block.actions"
          />
        </UDropdownMenu>
      </UEditorDragHandle>
    </UEditor>
    <ImagePicker v-model:open="pickerOpen" @pick="insertImage" />
  </div>
</template>
