import { MAX_FILE_BYTES, MEDIA_MAX_WIDTH, MEDIA_MAX_WIDTHS, MEDIA_MIN_WIDTH } from '@hollware/core'

export type Widths =
  | { readonly ok: true; readonly widths: number[] }
  | { readonly ok: false; readonly min: number; readonly max: number; readonly most: number }

export function parseWidths(text: string): Widths {
  const refused = {
    ok: false,
    min: MEDIA_MIN_WIDTH,
    max: MEDIA_MAX_WIDTH,
    most: MEDIA_MAX_WIDTHS,
  } as const
  const parts = text.split(/[\s,]+/).filter((part) => part !== '')
  const widths = [...new Set(parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN)))]
  if (widths.length > MEDIA_MAX_WIDTHS) return refused
  if (widths.some((width) => !(width >= MEDIA_MIN_WIDTH && width <= MEDIA_MAX_WIDTH))) {
    return refused
  }
  return { ok: true, widths: widths.sort((a, b) => a - b) }
}

const MEBIBYTE = 1024 * 1024

export function megabytesOf(bytes: number): number {
  return Math.round(bytes / MEBIBYTE)
}

export type MaxBytes =
  | { readonly ok: true; readonly bytes: number }
  | { readonly ok: false; readonly most: number }

export function parseMaxMegabytes(megabytes: number | undefined): MaxBytes {
  const most = Math.floor(MAX_FILE_BYTES / MEBIBYTE)
  if (
    megabytes === undefined ||
    !Number.isInteger(megabytes) ||
    megabytes < 1 ||
    megabytes > most
  ) {
    return { ok: false, most }
  }
  return { ok: true, bytes: megabytes * MEBIBYTE }
}
