import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {USE_MOCK_SESSION} from '../config';
import {MockSessionClient} from './MockSessionClient';
import {SocketSessionClient} from './SocketSessionClient';
import type {
  SessionClient,
  SessionState,
  Recommendation,
  SettingsApplyPayload,
  OverlayOpenPayload,
  PlaybackCommandPayload,
} from './types';

interface SessionCtx {
  client: SessionClient;
  sessionState: SessionState | null;
  recommendation: Recommendation | null;
  clearRecommendation: () => void;
  activeOverlay: 'modes' | 'assistant' | 'compare' | null;
  setActiveOverlay: (o: 'modes' | 'assistant' | 'compare' | null) => void;
  onSettingsApply: ((cb: (p: SettingsApplyPayload) => void) => () => void);
  onPlaybackCommand: ((cb: (p: PlaybackCommandPayload) => void) => () => void);
}

const Ctx = createContext<SessionCtx | null>(null);

export const useSessionContext = (): SessionCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) { throw new Error('useSessionContext must be used within SessionProvider'); }
  return ctx;
};

export const SessionProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const clientRef = useRef<SessionClient>(
    USE_MOCK_SESSION
      ? new MockSessionClient()
      : new SocketSessionClient(),
  );

  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<'modes' | 'assistant' | 'compare' | null>(null);

  // These are ref-based callbacks so that consumers can subscribe/unsubscribe
  // without the context re-rendering on every settings:apply event.
  const settingsApplyCbs = useRef(new Set<(p: SettingsApplyPayload) => void>());
  const playbackCmdCbs = useRef(new Set<(p: PlaybackCommandPayload) => void>());

  useEffect(() => {
    const c = clientRef.current;

    const onState = (s: SessionState): void => setSessionState(s);
    const onRec = (r: Recommendation): void => setRecommendation(r);
    const onOverlay = (p: OverlayOpenPayload): void => setActiveOverlay(p.overlay);
    const onApply = (p: SettingsApplyPayload): void => {
      settingsApplyCbs.current.forEach(cb => cb(p));
    };
    const onCmd = (p: PlaybackCommandPayload): void => {
      playbackCmdCbs.current.forEach(cb => cb(p));
    };

    c.on('session:state', onState);
    c.on('ai:recommendation', onRec);
    c.on('overlay:open', onOverlay);
    c.on('settings:apply', onApply);
    c.on('playback:command', onCmd);
    c.connect();

    return () => {
      c.off('session:state', onState);
      c.off('ai:recommendation', onRec);
      c.off('overlay:open', onOverlay);
      c.off('settings:apply', onApply);
      c.off('playback:command', onCmd);
      c.disconnect();
    };
  }, []);

  const onSettingsApply = (cb: (p: SettingsApplyPayload) => void): (() => void) => {
    settingsApplyCbs.current.add(cb);
    return () => { settingsApplyCbs.current.delete(cb); };
  };

  const onPlaybackCommand = (cb: (p: PlaybackCommandPayload) => void): (() => void) => {
    playbackCmdCbs.current.add(cb);
    return () => { playbackCmdCbs.current.delete(cb); };
  };

  return (
    <Ctx.Provider value={{
      client: clientRef.current,
      sessionState,
      recommendation,
      clearRecommendation: () => setRecommendation(null),
      activeOverlay,
      setActiveOverlay,
      onSettingsApply,
      onPlaybackCommand,
      // expose sendModeUpdate via client directly
    }}>
      {children}
    </Ctx.Provider>
  );
};

export {SessionProvider as default};
