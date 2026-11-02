<script setup lang="ts">
import { markdown } from '@codemirror/lang-markdown'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Diagnostic } from '../lib/diagnostics.ts'
import { useMessages } from '../i18n/index.ts'
import { theme } from './editor-theme.ts'

const props = defineProps<{
  modelValue: string
  diagnostics: readonly Diagnostic[]
  readonly?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
const m = useMessages()

let view: EditorView | null = null

function stateOf(text: string): EditorState {
  return EditorState.create({
    doc: text,
    extensions: [
      basicSetup,
      markdown(),
      lintGutter(),
      EditorState.lineSeparator.of(text.includes('\r\n') ? '\r\n' : '\n'),
      EditorView.lineWrapping,
      EditorState.readOnly.of(props.readonly === true),
      EditorView.editable.of(props.readonly !== true),
      theme,
      EditorView.contentAttributes.of({ 'aria-label': m.value.editor.markdown }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
      }),
    ],
  })
}

onMounted(() => {
  if (host.value === null) return
  view = new EditorView({ parent: host.value, state: stateOf(props.modelValue) })
})

onBeforeUnmount(() => {
  view?.destroy()
})

watch(
  () => props.modelValue,
  (text) => {
    if (view !== null && view.state.doc.toString() !== text) view.setState(stateOf(text))
  },
)

watch(
  () => props.diagnostics,
  (diagnostics) => {
    if (view === null) return
    const length = view.state.doc.length
    view.dispatch(
      setDiagnostics(
        view.state,
        diagnostics.map((diagnostic) => ({
          ...diagnostic,
          from: Math.min(diagnostic.from, length),
          to: Math.min(diagnostic.to, length),
        })),
      ),
    )
  },
)
</script>

<template>
  <div ref="host" class="overflow-hidden rounded border border-default text-sm" />
</template>
