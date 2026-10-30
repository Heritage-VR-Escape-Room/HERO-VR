/**
 * Minimap, top right: north-up, 45 m around the player. Plaza, pyramid,
 * kiosk, lamps and bench as shapes; people as dots; the current task as a
 * pulsing marker (an edge arrow when off the map); the UV trail while the
 * Spectrum Lenses are on.
 */
import type { I18n } from '../logic/i18n';

export interface MapFeature {
  kind: 'pyramid' | 'kiosk' | 'lamp' | 'bench' | 'npc';
  x: number;
  z: number;
}

export interface MinimapFrame {
  player: { x: number; z: number; yawDeg: number };
  marker: { x: number; z: number } | null;
  trail: ReadonlyArray<{ x: number; z: number }> | null;
  npcs: ReadonlyArray<{ x: number; z: number }>;
}

const SIZE = 200;
const RANGE_M = 45;

export function createMinimap(o: { i18n: I18n; plaza: { x: number; z: number; radius: number }; features: MapFeature[] }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'minimap';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  document.body.append(canvas);
  const g = canvas.getContext('2d')!;
  const c = SIZE / 2;
  const k = (c - 6) / RANGE_M;
  let t = 0;

  return {
    setVisible(v: boolean) {
      canvas.hidden = !v;
    },
    draw(f: MinimapFrame, dt: number) {
      if (canvas.hidden) return;
      t += dt;
      const { x: px, z: pz } = f.player;
      // North up; east (-X in the world) to the right.
      const mx = (x: number): number => c - (x - px) * k;
      const my = (z: number): number => c - (z - pz) * k;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, SIZE, SIZE);
      g.save();
      g.beginPath();
      g.arc(c, c, c - 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = 'rgba(14, 18, 20, 0.78)';
      g.fillRect(0, 0, SIZE, SIZE);
      // Plaza paving.
      g.fillStyle = 'rgba(120, 112, 98, 0.35)';
      g.beginPath();
      g.arc(mx(o.plaza.x), my(o.plaza.z), o.plaza.radius * k, 0, Math.PI * 2);
      g.fill();
      for (const ft of o.features) {
        const x = mx(ft.x);
        const y = my(ft.z);
        if (ft.kind === 'pyramid') {
          g.fillStyle = '#b5654a';
          g.fillRect(x - 3.3 * k, y - 3.3 * k, 6.6 * k, 6.6 * k);
          g.strokeStyle = '#e1a07f';
          g.beginPath();
          g.moveTo(x - 3.3 * k, y - 3.3 * k);
          g.lineTo(x + 3.3 * k, y + 3.3 * k);
          g.moveTo(x + 3.3 * k, y - 3.3 * k);
          g.lineTo(x - 3.3 * k, y + 3.3 * k);
          g.stroke();
        } else if (ft.kind === 'kiosk') {
          g.fillStyle = '#7d8a93';
          g.fillRect(x - 2 * k, y - 1.3 * k, 4 * k, 2.6 * k);
        } else if (ft.kind === 'lamp') {
          g.fillStyle = '#ffcf7a';
          g.beginPath();
          g.arc(x, y, 2, 0, Math.PI * 2);
          g.fill();
        } else if (ft.kind === 'bench') {
          g.fillStyle = '#8a6a48';
          g.fillRect(x - 1, y - 1, 3, 3);
        }
      }
      if (f.trail) {
        g.strokeStyle = 'rgba(176, 102, 255, 0.95)';
        g.lineWidth = 2.5;
        g.setLineDash([4, 4]);
        g.beginPath();
        f.trail.forEach((p, i) => (i ? g.lineTo(mx(p.x), my(p.z)) : g.moveTo(mx(p.x), my(p.z))));
        g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = '#e9dfc7';
      for (const n of f.npcs) {
        g.beginPath();
        g.arc(mx(n.x), my(n.z), 2.6, 0, Math.PI * 2);
        g.fill();
      }
      if (f.marker) {
        let x = mx(f.marker.x);
        let y = my(f.marker.z);
        const dx = x - c;
        const dy = y - c;
        const d = Math.hypot(dx, dy);
        const edge = c - 12;
        const off = d > edge;
        if (off) {
          x = c + (dx / d) * edge;
          y = c + (dy / d) * edge;
        }
        const pulse = 4 + 2 * Math.sin(t * 4);
        g.strokeStyle = '#ffd65a';
        g.fillStyle = '#ffd65a';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, off ? 4 : pulse, 0, Math.PI * 2);
        off ? g.fill() : g.stroke();
      }
      g.restore();
      // Player arrow, rotated by the bearing (clockwise from north).
      g.save();
      g.translate(c, c);
      g.rotate((f.player.yawDeg * Math.PI) / 180);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(0, -8);
      g.lineTo(5.5, 6);
      g.lineTo(0, 3);
      g.lineTo(-5.5, 6);
      g.closePath();
      g.fill();
      g.restore();
      // Rim and north.
      g.strokeStyle = 'rgba(176, 141, 87, 0.8)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c, c, c - 2, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#e9dfc7';
      g.font = 'bold 13px "Noto Sans", "Noto Naskh Arabic", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(o.i18n.t('ui.map.north'), c, 13);
    },
  };
}

export const USED_KEYS: readonly string[] = ['ui.map.north'];
