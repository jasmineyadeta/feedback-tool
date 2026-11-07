import type { Tone } from '@ft/shared';

/** Owner-facing tone colours. Always shown with a word too, never colour alone. */
export const TONE: Record<Tone, { label: string; dot: string; chip: string; hex: string }> = {
  action: {
    label: 'Action',
    dot: 'bg-red-600',
    chip: 'bg-red-50 text-red-800 ring-red-300',
    hex: '#c62828',
  },
  praise: {
    label: 'Praise',
    dot: 'bg-green-700',
    chip: 'bg-green-50 text-green-800 ring-green-300',
    hex: '#2e7d32',
  },
  note: {
    label: 'Note',
    dot: 'bg-blue-600',
    chip: 'bg-blue-50 text-blue-800 ring-blue-300',
    hex: '#2f5bd3',
  },
};
export const TONE_ORDER: Tone[] = ['action', 'praise', 'note'];
