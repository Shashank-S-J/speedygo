'use client';

import { useEffect, useRef, memo } from 'react';
import type { SceneConfig } from './engine';

/**
 * LogisticsScene — drop-in React component that renders a full-screen or inline
 * 3D logistics animation.  Lazy-loads Three.js so it doesn't bloat SSR.
 *
 * Usage:
 *   <LogisticsScene type="login" theme="customer" className="absolute inset-0 -z-10" />
 */
interface Props extends Partial<SceneConfig> {
  type: SceneConfig['type'];
  theme: SceneConfig['theme'];
  className?: string;
  style?: React.CSSProperties;
}

function LogisticsSceneInner({ type, theme, interactive, intensity, overlay, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<import('./engine').LogisticsSceneEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let disposed = false;

    // Dynamic import — keeps Three.js out of the server bundle
    import('./engine').then(({ LogisticsSceneEngine }) => {
      if (disposed || !canvasRef.current) return;
      const engine = new LogisticsSceneEngine(canvasRef.current, {
        type,
        theme,
        interactive: interactive ?? true,
        intensity: intensity ?? 0.8,
        overlay: overlay ?? true,
      });
      engineRef.current = engine;
      engine.start();
    });

    return () => {
      disposed = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [type, theme, interactive, intensity, overlay]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        touchAction: 'none',
        ...style,
      }}
    />
  );
}

export const LogisticsScene = memo(LogisticsSceneInner);

