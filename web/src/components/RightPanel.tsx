import type { ReactNode } from 'react';

interface RightPanelProps {
  children?: ReactNode;
  chatSlot: ReactNode;
}

export function RightPanel({ children, chatSlot }: RightPanelProps) {
  return (
    <div className={`right-panel${children ? '' : ' right-panel--chat-only'}`}>
      {children && (
        <div className="right-panel-content">
          {children}
        </div>
      )}
      <div className="right-panel-chat">
        {chatSlot}
      </div>
    </div>
  );
}
