import type { ReactNode } from 'react';

interface RightPanelProps {
  children: ReactNode;      // Step-specific content (WalkthroughStepList, FindingsSidebar, SubmissionPanel, etc.)
  chatSlot: ReactNode;       // ChatPanel instance, always rendered at bottom
}

export function RightPanel({ children, chatSlot }: RightPanelProps) {
  return (
    <div className="right-panel">
      <div className="right-panel-content">
        {children}
      </div>
      <div className="right-panel-chat">
        {chatSlot}
      </div>
    </div>
  );
}
