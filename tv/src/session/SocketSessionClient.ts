import {io, type Socket} from 'socket.io-client';
import {BACKEND_URL} from '../config';
import type {
  SessionClient,
  SessionEventName,
  SessionEventPayload,
  ModeId,
} from './types';

export class SocketSessionClient implements SessionClient {
  private _code: string = '----';
  private socket: Socket | null = null;
  private handlers = new Map<string, Set<(p: unknown) => void>>();

  get code(): string {
    return this._code;
  }

  connect(): void {
    fetch(`${BACKEND_URL}/api/sessions`, {method: 'POST'})
      .then(r => {
        if (!r.ok) { throw new Error(`HTTP ${r.status}`); }
        return r.json() as Promise<{code: string}>;
      })
      .then(state => {
        this._code = state.code;
        this.connectSocket(state.code);
      })
      .catch(err => {
        console.warn('[socket] session create failed:', (err as Error).message);
      });
  }

  private connectSocket(code: string): void {
    const socket = io(BACKEND_URL, {
      transports: ['websocket'],
      query: {code, role: 'tv'},
    });
    this.socket = socket;

    socket.on('session:state',    (p) => this.emit('session:state', p));
    socket.on('settings:apply',   (p) => this.emit('settings:apply', p));
    socket.on('scene:insights',   (p) => this.emit('scene:insights', p));
    socket.on('overlay:open',     (p) => this.emit('overlay:open', p));
    socket.on('playback:command', (p) => this.emit('playback:command', p));
    socket.on('ai:recommendation', (p) => {
      this.emit('ai:recommendation', p);
      // Backend does not send overlay:open with recommendations; open the panel locally.
      this.emit('overlay:open', {overlay: 'assistant'});
    });

    socket.on('connect_error', (err) => {
      console.warn('[socket] connect error:', err.message);
    });
    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected:', reason);
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  sendModeUpdate(mode: ModeId, _source: string): void {
    this.socket?.emit('mode:update', {mode});
  }

  sendRecommendationResponse(id: string, accepted: boolean): void {
    this.socket?.emit('recommendation:respond', {id, accepted});
  }

  sendSettingsUndo(): void {
    this.socket?.emit('settings:undo');
  }

  sendPlaybackUpdate(clipId: string, position: number, playing: boolean): void {
    this.socket?.emit('playback:update', {clipId, position, playing});
  }

  on<K extends SessionEventName>(event: K, handler: (p: SessionEventPayload<K>) => void): void {
    if (!this.handlers.has(event)) {this.handlers.set(event, new Set());}
    this.handlers.get(event)!.add(handler as (p: unknown) => void);
  }

  off<K extends SessionEventName>(event: K, handler: (p: SessionEventPayload<K>) => void): void {
    this.handlers.get(event)?.delete(handler as (p: unknown) => void);
  }

  private emit<K extends SessionEventName>(event: K, payload: SessionEventPayload<K>): void {
    this.handlers.get(event)?.forEach(h => h(payload));
  }
}
