// TopBar + StageStepper — ported from topbar.jsx.
import { Fragment } from 'react';
import { PR, type Stage } from '../data';
import { cn } from '../utils/highlight';
import { Ic } from './icons';

export function TopBar() {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="logo">P</div>
        <span>PairReview</span>
      </div>
      <div className="sep" />
      <div className="pr">
        <span className="num">
          {PR.repo} #{PR.number}
        </span>
        <span className="title">{PR.title}</span>
      </div>
      <div className="branch">
        <Ic.branch /> {PR.branch} <span style={{ color: 'var(--ink-4)' }}>→</span> {PR.base}
      </div>
      <div className="spacer" />
      <button type="button" className="topbtn">
        <Ic.settings /> Settings
      </button>
      <button type="button" className="topbtn">
        Request changes
      </button>
      <button type="button" className="primary">
        Approve &amp; merge
      </button>
    </div>
  );
}

export function StageStepper({
  stages,
  active,
  onPick,
}: {
  stages: Stage[];
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="stages">
      {stages.map((s, i) => (
        <Fragment key={s.id}>
          <div
            className={cn('stage', s.status === 'done' && 'done', s.id === active && 'active')}
            onClick={() => onPick(s.id)}
          >
            <div className="num">{s.status === 'done' ? <Ic.check /> : i + 1}</div>
            <div className="meta">
              <div className="label">{s.label}</div>
              <div className="sub">{s.sub}</div>
            </div>
          </div>
          {i < stages.length - 1 && (
            <div className="stage-connector">
              <Ic.chev />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}
