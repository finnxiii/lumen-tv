// Stage 8 will complete this. Currently a no-op stub.
import type {
  SessionClient,
  SessionEventName,
  SessionEventPayload,
  ModeId,
} from './types';
import {SOCKET_URL} from '../config';

export class SocketSessionClient implements SessionClient {
  readonly code: string;
  private handlers = new Map<string, Set<(p: any) => void>>();

  constructor(code: string) {
    this.code = code;
    // Socket.IO connection will be set up here in Stage 8.
    // Connect with: { code, role: 'tv' }, transport: ['websocket']
    console.log(`[socket] would connect to ${SOCKET_URL} with code ${code}`);
  }

  connect(): void {}
  disconnect(): void {}
  sendModeUpdate(_mode: ModeId, _source: string): void {}
  sendRecommendationResponse(_id: string, _accepted: boolean): void {}
  sendSettingsUndo(): void {}
  sendPlaybackUpdate(_clipId: string, _position: number, _playing: boolean): void {}

  on<K extends SessionEventName>(event: K, handler: (p: SessionEventPayload<K>) => void): void {
    if (!this.handlers.has(event)) { this.handlers.set(event, new Set()); }
    this.handlers.get(event)!.add(handler);
  }

  off<K extends SessionEventName>(event: K, handler: (p: SessionEventPayload<K>) => void): void {
    this.handlers.get(event)?.delete(handler);
  }
}
