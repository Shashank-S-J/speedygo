'use client';

import { LogisticsScene } from '@speedygo/three-scene';
import type { SceneType, ThemeName } from '@speedygo/three-scene';

/**
 * A compact 3D scene that sits behind a page header section.
 * Height adapts: mobile 180px, tablet 220px, desktop 260px
 */
export function SceneHero({
  type,
  theme,
  children,
}: {
  type: SceneType;
  theme: ThemeName;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative w-full h-[180px] sm:h-[220px] lg:h-[260px] rounded-2xl overflow-hidden mb-5">
      <div className="absolute inset-0">
        <LogisticsScene type={type} theme={theme} interactive={false} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
      {children && (
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 z-10">
          {children}
        </div>
      )}
    </div>
  );
}

