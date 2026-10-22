import type {
  SessionClient,
  SessionEventName,
  SessionEventPayload,
  SessionState,
  ModeId,
  PictureSettings,
  Recommendation,
} from './types';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

const ZERO_SETTINGS: PictureSettings = {
  brightness: 0, contrast: 0, saturation: 0,
  warmth: 0, shadows: 0, sharpness: 0,
};

const BRIGHT_SETTINGS: PictureSettings = {
  brightness: 20, contrast: 15, saturation: 10,
  warmth: -5, shadows: 10, sharpness: 5,
};

export class MockSessionClient implements SessionClient {
  readonly code: string;
  private handlers = new Map<string, Set<(p: any) => void>>();
  private state: SessionState;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private playbackMs = 0;
  private playbackTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.code = generateCode();
    this.state = {
      code: this.code,
      phoneConnected: false,
      mode: 'cinema',
      settings: ZERO_SETTINGS,
      clipId: 'night',
      roomLight: 'dim',
      expiresAt: Date.now() + 600_000,
    };
  }

  connect(): void {
    this.emit('session:state', {...this.state});

    // Phone joins after 4 s
    this.timers.push(
      setTimeout(() => {
        this.state = {...this.state, phoneConnected: true};
        this.emit('session:state', {...this.state});
      }, 4_000),
    );

    // Track playback time to fire recommendation ~15 s in
    this.playbackTimer = setInterval(() => {
      this.playbackMs += 500;
      if (this.playbackMs >= 15_000 && this.state.clipId === 'night') {
        this.fireRecommendation();
        if (this.playbackTimer !== null) {
          clearInterval(this.playbackTimer);
          this.playbackTimer = null;
        }
      }
    }, 500);
  }

  disconnect(): void {
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    if (this.playbackTimer !== null) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  sendModeUpdate(mode: ModeId, _source: string): void {
    const settings = mode === 'bright' ? BRIGHT_SETTINGS : ZERO_SETTINGS;
    this.state = {...this.state, mode, settings};
    // Immediate apply (mock backend)
    this.emit('settings:apply', {mode, settings, source: 'tv'});
  }

  sendRecommendationResponse(_id: string, _accepted: boolean): void {}
  sendSettingsUndo(): void {
    this.emit('settings:apply', {
      mode: this.state.mode,
      settings: ZERO_SETTINGS,
      source: 'undo',
    });
  }
  sendPlaybackUpdate(clipId: string, _position: number, _playing: boolean): void {
    if (clipId !== this.state.clipId) {
      this.state = {...this.state, clipId: clipId as 'night' | 'day'};
    }
  }

  on<K extends SessionEventName>(event: K, handler: (p: SessionEventPayload<K>) => void): void {
    if (!this.handlers.has(event)) { this.handlers.set(event, new Set()); }
    this.handlers.get(event)!.add(handler);
  }

  off<K extends SessionEventName>(event: K, handler: (p: SessionEventPayload<K>) => void): void {
    this.handlers.get(event)?.delete(handler);
  }

  private emit<K extends SessionEventName>(event: K, payload: SessionEventPayload<K>): void {
    this.handlers.get(event)?.forEach(h => h(payload));
  }

  private fireRecommendation(): void {
    const rec: Recommendation = {
      id: 'mock-rec-1',
      request: "I can't see what's happening in this dark scene",
      mode: 'bright',
      title: 'Switch to Bright Room mode',
      settings: BRIGHT_SETTINGS,
      reasons: [
        {label: 'Scene', value: 'Low-light environment detected'},
        {label: 'Room', value: 'Ambient light level is high'},
        {label: 'Preference', value: 'You preferred brighter modes previously'},
      ],
      explanation: "The scene is dark and your room is bright, which reduces perceived contrast. Bright Room mode compensates by boosting brightness and contrast.",
    };
    this.emit('ai:recommendation', rec);
    this.emit('overlay:open', {overlay: 'assistant'});
  }
}
