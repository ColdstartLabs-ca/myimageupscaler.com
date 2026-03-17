/**
 * ChatGPT Badge Component
 *
 * Subtle "Recommended by AI" badge shown to visitors referred from ChatGPT or other AI search engines.
 * Server-rendered via parent component to avoid CLS.
 *
 * PRD: ChatGPT Traffic Optimization - Phase 2
 */

import { Bot } from 'lucide-react';

interface IChatGPTBadgeProps {
  source: 'chatgpt' | 'perplexity' | 'claude' | 'google_sge';
}

const SOURCE_CONFIG: Record<IChatGPTBadgeProps['source'], { label: string; className: string }> = {
  chatgpt: {
    label: 'Recommended by ChatGPT',
    className: 'from-green-500/20 to-green-600/20 border-green-500/30',
  },
  perplexity: {
    label: 'Recommended by Perplexity',
    className: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30',
  },
  claude: {
    label: 'Recommended by Claude',
    className: 'from-orange-500/20 to-amber-500/20 border-orange-500/30',
  },
  google_sge: {
    label: 'AI Overview Recommended',
    className: 'from-purple-500/20 to-violet-500/20 border-purple-500/30',
  },
};

export function ChatGPTBadge({ source }: IChatGPTBadgeProps): JSX.Element {
  const config = SOURCE_CONFIG[source];

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full
        bg-gradient-to-r ${config.className}
        border backdrop-blur-sm
        text-xs font-medium text-white/90
        animate-fade-in
      `}
    >
      <Bot size={14} className="text-white/70" />
      <span>{config.label}</span>
    </div>
  );
}
