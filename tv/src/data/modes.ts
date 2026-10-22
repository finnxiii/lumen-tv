import type {ModeId} from '../session/types';

export interface ModeInfo {
  id: ModeId;
  label: string;
  description: string;
  color: string;
  adjustments: string[];
}

export const MODES: ModeInfo[] = [
  {
    id: 'cinema',
    label: 'Cinema',
    description: 'Rich colours and natural contrast for movie nights.',
    color: '#f2b04a',
    adjustments: ['Warm tones', 'Reduced saturation', 'Enhanced shadows'],
  },
  {
    id: 'night',
    label: 'Night',
    description: 'Reduced brightness for late-night viewing.',
    color: '#9b8cff',
    adjustments: ['Lower brightness', 'Cool tone', 'Soft contrast'],
  },
  {
    id: 'bright',
    label: 'Bright Room',
    description: 'Punchy contrast for well-lit rooms.',
    color: '#ffd166',
    adjustments: ['Higher brightness', 'Boosted contrast', 'Vivid colour'],
  },
  {
    id: 'sports',
    label: 'Sports',
    description: 'High clarity and vivid motion for fast action.',
    color: '#3ddc97',
    adjustments: ['Max sharpness', 'High contrast', 'Motion clarity'],
  },
];
