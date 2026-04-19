// FileExplorer — ported from explorer.jsx.
import { useMemo, useState } from 'react';
import {
  FILE_STATE,
  PR,
  REPO_TREE,
  type RepoFileNode,
  type RepoFolderNode,
  type RepoNode,
} from '../data';
import { cn } from '../utils/highlight';
import { Ic } from './icons';

export type ExplorerFilter = 'changed' | 'all';

interface ExplorerProps {
  filter: ExplorerFilter;
  setFilter: (f: ExplorerFilter) => void;
  activePath: string;
  onPick: (path: string) => void;
}

export function FileExplorer({ filter, setFilter, activePath, onPick }: ExplorerProps) {
  const changedCount = Object.keys(FILE_STATE).length;

  const changedFiles = useMemo(() => {
    const out: RepoFileNode[] = [];
    function walk(node: RepoNode) {
      if (node.type === 'folder') node.children.forEach(walk);
      else if (node.changed) out.push(node);
    }
    REPO_TREE.forEach(walk);
    return out;
  }, []);

  function renderNode(node: RepoNode, depth: number) {
    if (node.type === 'folder') {
      return (
        <FolderNode
          key={node.name + depth}
          node={node}
          depth={depth}
          activePath={activePath}
          onPick={onPick}
          filter={filter}
        />
      );
    }
    return (
      <FileNode
        key={node.path}
        file={node}
        depth={depth}
        active={activePath === node.path}
        onPick={onPick}
        filter={filter}
      />
    );
  }

  return (
    <div className="explorer">
      <div className="exp-head">
        <div className="row">
          <div className="exp-title">Files</div>
          <div className="exp-toggle">
            <button
              type="button"
              className={cn(filter === 'changed' && 'on')}
              onClick={() => setFilter('changed')}
            >
              Changed
            </button>
            <button
              type="button"
              className={cn(filter === 'all' && 'on')}
              onClick={() => setFilter('all')}
            >
              Repo
            </button>
          </div>
        </div>
        <div className="exp-search">
          <Ic.search />
          <input
            placeholder={filter === 'changed' ? 'Filter changed files…' : 'Search repo…'}
          />
        </div>
      </div>

      <div className="exp-summary">
        <span>
          <span className="dot" style={{ background: 'var(--ok)' }} /> 1 reviewed
        </span>
        <span>
          <span className="dot" style={{ background: 'var(--warn)' }} /> 3 threads
        </span>
        <span>
          <span className="dot" style={{ background: 'var(--ink-4)', opacity: 0.4 }} /> 2 pending
        </span>
      </div>

      <div className="exp-list">
        {filter === 'changed' ? (
          <>
            <div className="exp-group">Changed · {changedCount}</div>
            {changedFiles.map((f) => (
              <FileNode
                key={f.path}
                file={f}
                depth={0}
                active={activePath === f.path}
                onPick={onPick}
                filter={filter}
              />
            ))}
          </>
        ) : (
          <>
            <div className="exp-group">{PR.repo}</div>
            {REPO_TREE.map((n) => renderNode(n, 0))}
          </>
        )}
      </div>
    </div>
  );
}

function FolderNode({
  node,
  depth,
  activePath,
  onPick,
  filter,
}: {
  node: RepoFolderNode;
  depth: number;
  activePath: string;
  onPick: (p: string) => void;
  filter: ExplorerFilter;
}) {
  const [open, setOpen] = useState(node.open ?? false);
  return (
    <>
      <div
        className="exp-folder"
        style={{ ['--indent' as string]: `${14 + depth * 14}px` }}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="chev"
          style={{
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 120ms',
          }}
        >
          <Ic.chev />
        </span>
        <Ic.folder />
        <span className="folder-name">{node.name}</span>
      </div>
      {open &&
        node.children.map((c) =>
          c.type === 'folder' ? (
            <FolderNode
              key={c.name + depth}
              node={c}
              depth={depth + 1}
              activePath={activePath}
              onPick={onPick}
              filter={filter}
            />
          ) : (
            <FileNode
              key={c.path}
              file={c}
              depth={depth + 1}
              active={activePath === c.path}
              onPick={onPick}
              filter={filter}
            />
          )
        )}
    </>
  );
}

function FileNode({
  file,
  depth,
  active,
  onPick,
  filter,
}: {
  file: RepoFileNode;
  depth: number;
  active: boolean;
  onPick: (p: string) => void;
  filter: ExplorerFilter;
}) {
  const state = FILE_STATE[file.path];
  const isChanged = !!state;
  const name = file.path.split('/').pop();

  return (
    <div
      className={cn('exp-file', active && 'active', !isChanged && filter === 'all' && 'dim')}
      style={{ ['--indent' as string]: `${14 + depth * 14}px` }}
      onClick={() => onPick(file.path)}
    >
      <span className={cn('file-icon', file.ext)} />
      <span className="name">{name}</span>
      {state && (
        <>
          <span className="lines">
            {state.adds > 0 && <span className="add">+{state.adds}</span>}
            {state.dels > 0 && <span className="rem">−{state.dels}</span>}
          </span>
          <span
            className={cn('status', state.status)}
            title={
              state.status === 'threads'
                ? `${state.threads} open thread${state.threads !== 1 ? 's' : ''}`
                : state.status
            }
          />
        </>
      )}
    </div>
  );
}
