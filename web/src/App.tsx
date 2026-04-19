// App root — Claude Pair Review 3-column layout.
// Ported faithfully from the design handoff bundle (app.jsx).
// Still uses fixtures (web/src/data.ts) — live SSE wiring is staged for later phases.
import { useState } from 'react';
import { AUTH_DIFF, CHAT, STAGES, THREAD_INDEX, THREADS } from './data';
import { ChatPanel } from './components/ChatPanel';
import { DiffViewer, type DiffView, type ThreadLayout } from './components/DiffViewer';
import { FileExplorer, type ExplorerFilter } from './components/FileExplorer';
import { InlineThread } from './components/InlineThread';
import { StageStepper, TopBar } from './components/TopBar';
import { TweaksPanel, TWEAK_DEFAULTS, type Tweaks } from './components/TweaksPanel';
import { Ic } from './components/icons';
import { StaleDiffModal } from './components/StaleDiffModal';

export default function App() {
  const [activePath, setActivePath] = useState('src/middleware/auth.ts');
  const [filter, setFilter] = useState<ExplorerFilter>('changed');
  const [view, setView] = useState<DiffView>('unified');
  const [activeStage, setActiveStage] = useState('correctness');
  // Seed the blocker thread open per the design's initial state.
  const [openThreadId, setOpenThreadId] = useState<string | null>('t2');
  const [sideThreadId, setSideThreadId] = useState<string | null>(null);
  const [gutterPop, setGutterPop] = useState<string | null>(null);
  const [tweaks, setTweaks] = useState<Tweaks>(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(true);

  function openThread(tid: string) {
    if (tweaks.threadLayout === 'side') {
      setSideThreadId(tid);
      setOpenThreadId(null);
      setGutterPop(null);
    } else if (tweaks.threadLayout === 'gutter') {
      setGutterPop(tid);
      setOpenThreadId(null);
      setSideThreadId(null);
    } else {
      setOpenThreadId(tid);
      setSideThreadId(null);
      setGutterPop(null);
    }
  }

  return (
    <>
      <div className="app" data-screen-label="Claude Pair Review">
        <TopBar />
        <StageStepper stages={STAGES} active={activeStage} onPick={setActiveStage} />
        <div className="main">
          <FileExplorer
            filter={filter}
            setFilter={setFilter}
            activePath={activePath}
            onPick={setActivePath}
          />
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <DiffViewer
              diff={AUTH_DIFF}
              view={view}
              onViewChange={setView}
              openThreadId={openThreadId}
              onOpenThread={openThread}
              onCloseThread={() => setOpenThreadId(null)}
              threadLayout={tweaks.threadLayout}
            />
            {tweaks.threadLayout === 'gutter' && gutterPop && (
              <GutterBubble tid={gutterPop} onClose={() => setGutterPop(null)} />
            )}
          </div>
          {tweaks.threadLayout === 'side' && sideThreadId ? (
            <SideThread tid={sideThreadId} onClose={() => setSideThreadId(null)} />
          ) : (
            <ChatPanel
              progressViz={tweaks.progressViz}
              stages={STAGES}
              activeStage={activeStage}
              chat={CHAT}
              threadIndex={THREAD_INDEX}
              onOpenThread={openThread}
            />
          )}
        </div>
        <TweaksPanel
          open={tweaksOpen}
          tweaks={tweaks}
          setTweaks={setTweaks}
          onClose={() => setTweaksOpen(false)}
        />
      </div>
      <StaleDiffModal />
    </>
  );
}

function GutterBubble({ tid, onClose }: { tid: string; onClose: () => void }) {
  const t = THREADS[tid];
  if (!t) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        left: 80,
        width: 420,
        background: 'var(--paper)',
        border: '1px solid var(--line-2)',
        borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04)',
        zIndex: 50,
        overflow: 'hidden',
      }}
    >
      <InlineThread thread={t} onClose={onClose} />
    </div>
  );
}

function SideThread({ tid, onClose }: { tid: string; onClose: () => void }) {
  const t = THREADS[tid];
  if (!t) return null;
  return (
    <div className="chat" style={{ borderLeft: '1px solid var(--line)' }}>
      <div className="chat-head">
        <div className="avatar" style={{ background: 'var(--warn)' }}>
          !
        </div>
        <div className="meta">
          <div className="name">Thread · {t.messages.length} messages</div>
          <div className="status" style={{ fontFamily: 'var(--mono)' }}>
            src/middleware/auth.ts:{t.lineNew}
          </div>
        </div>
        <button type="button" className="btn-sm" onClick={onClose}>
          <Ic.x />
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <InlineThread thread={t} onClose={onClose} />
      </div>
    </div>
  );
}
