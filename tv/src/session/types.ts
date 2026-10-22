export type ModeId = 'cinema' | 'night' | 'bright' | 'sports';
export type VariantId = 'original' | ModeId;
export type ClipId = 'night' | 'day';

export interface PictureSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  shadows: number;
  sharpness: number;
}

export interface SessionState {
  code: string;
  phoneConnected: boolean;
  mode: ModeId;
  settings: PictureSettings;
  clipId: ClipId;
  roomLight: 'dark' | 'dim' | 'normal' | 'bright';
  expiresAt: number;
}

export interface Recommendation {
  id: string;
  request?: string;
  mode: ModeId;
  title: string;
  settings: PictureSettings;
  reasons: {label: string; value: string}[];
  explanation: string;
}

export interface SceneInsights {
  clipId: string;
  timestamp: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sceneChange: boolean;
  label?: string;
}

export interface SettingsApplyPayload {
  mode: ModeId;
  settings: PictureSettings;
  source: 'phone' | 'ai' | 'tv' | 'undo';
}

export interface OverlayOpenPayload {
  overlay: 'modes' | 'assistant' | 'compare' | null;
}

export interface PlaybackCommandPayload {
  action: 'play' | 'pause' | 'seek';
  position?: number;
}

type EventMap = {
  'session:state': SessionState;
  'settings:apply': SettingsApplyPayload;
  'ai:recommendation': Recommendation;
  'scene:insights': SceneInsights;
  'overlay:open': OverlayOpenPayload;
  'playback:command': PlaybackCommandPayload;
};

export type SessionEventName = keyof EventMap;
export type SessionEventPayload<K extends SessionEventName> = EventMap[K];

export interface SessionClient {
  readonly code: string;
  connect(): void;
  disconnect(): void;
  sendModeUpdate(mode: ModeId, source: string): void;
  sendRecommendationResponse(id: string, accepted: boolean): void;
  sendSettingsUndo(): void;
  sendPlaybackUpdate(clipId: string, position: number, playing: boolean): void;
  on<K extends SessionEventName>(event: K, handler: (p: SessionEventPayload<K>) => void): void;
  off<K extends SessionEventName>(event: K, handler: (p: SessionEventPayload<K>) => void): void;
}
