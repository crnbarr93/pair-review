// TweaksPanel — floating panel for switching thread layout + progress viz variants.
// Ported from tweaks.jsx.
import type { ProgressViz } from './ChatPanel';
import type { ThreadLayout } from './DiffViewer';
import { cn } from '../utils/highlight';
import { Ic } from './icons';

export interface Tweaks {
  threadLayout: ThreadLayout;
  progressViz: ProgressViz;
}

export const TWEAK_DEFAULTS: Tweaks = {
  threadLayout: 'inline',
  progressViz: 'checklist',
};

interface ThreadLayoutOpt {
  id: ThreadLayout;
  name: string;
  preview: string;
  desc: string;
}

interface ProgressVizOpt {
  id: ProgressViz;
  name: string;
  preview: string;
}

const THREAD_LAYOUTS: ThreadLayoutOpt[] = [
  { id: 'inline', name: 'Inline expand', preview: 'v-inline', desc: 'Expands between diff rows' },
  { id: 'gutter', name: 'Gutter bubble', preview: 'v-gutter', desc: 'Floats over the gutter' },
  { id: 'side', name: 'Sync side-panel', preview: 'v-side', desc: 'Opens in chat column' },
];

const PROGRESS_VIZ_OPTS: ProgressVizOpt[] = [
  { id: 'checklist', name: 'Plan checklist', preview: 'v-stepper' },
  { id: 'bar', name: 'Segmented bar', preview: 'v-bar' },
  { id: 'ring', name: 'Progress ring', preview: 'v-ring' },
  { id: 'kanban', name: 'Kanban columns', preview: 'v-kanban' },
];

interface TweaksPanelProps {
  open: boolean;
  tweaks: Tweaks;
  setTweaks: (next: Tweaks | ((prev: Tweaks) => Tweaks)) => void;
  onClose: () => void;
}

export function TweaksPanel({ open, tweaks, setTweaks, onClose }: TweaksPanelProps) {
  if (!open) return null;

  function setLayout(id: ThreadLayout) {
    setTweaks((t) => ({ ...t, threadLayout: id }));
  }
  function setViz(id: ProgressViz) {
    setTweaks((t) => ({ ...t, progressViz: id }));
  }

  return (
    <div className="tweaks">
      <div className="tweaks-head">
        <span className="dot" />
        <span>Tweaks</span>
        <div className="spacer" />
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            textTransform: 'none',
            letterSpacing: 0,
            color: 'var(--ink-4)',
          }}
        >
          2 variants
        </span>
        <button
          type="button"
          className="btn-sm"
          onClick={onClose}
          style={{ padding: '2px 6px', marginLeft: 4 }}
          aria-label="Close tweaks"
        >
          <Ic.x />
        </button>
      </div>
      <div className="tweaks-body">
        <div className="tweak-group">
          <div className="glabel">
            <span>Thread layout</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{tweaks.threadLayout}</span>
          </div>
          <div className="tweak-options">
            {THREAD_LAYOUTS.map((o) => (
              <div
                key={o.id}
                className={cn('tweak-opt', tweaks.threadLayout === o.id && 'on')}
                onClick={() => setLayout(o.id)}
              >
                <div className={cn('preview', o.preview)} />
                <div className="name">
                  <div>{o.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{o.desc}</div>
                </div>
                <div className="check">
                  <Ic.check />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="tweak-group">
          <div className="glabel">
            <span>Review progress</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{tweaks.progressViz}</span>
          </div>
          <div className="tweak-options">
            {PROGRESS_VIZ_OPTS.map((o) => (
              <div
                key={o.id}
                className={cn('tweak-opt', tweaks.progressViz === o.id && 'on')}
                onClick={() => setViz(o.id)}
              >
                <div className={cn('preview', o.preview)} />
                <div className="name">{o.name}</div>
                <div className="check">
                  <Ic.check />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
