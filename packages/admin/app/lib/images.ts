export function base64OfFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('the file could not be read'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

export function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function needsAssets(body: string, known: ReadonlyMap<string, string>): boolean {
  return [...body.matchAll(/asset:ast_[0-9a-f]{26}/g)].some(([reference]) => !known.has(reference))
}

export type AssetKind = 'image' | 'video' | 'pdf'

export const ACCEPTED_FILES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'application/pdf',
].join(',')

export function kindOf(format: string): AssetKind {
  if (format.startsWith('video/')) return 'video'
  if (format === 'application/pdf') return 'pdf'
  return 'image'
}

export function markdownOf(asset: {
  readonly alt: string
  readonly reference: string
  readonly format: string
}): string {
  const shown = asset.alt.replaceAll(/[[\]]/g, '')
  return kindOf(asset.format) === 'image'
    ? `![${shown}](${asset.reference})`
    : `[${shown}](${asset.reference})`
}
