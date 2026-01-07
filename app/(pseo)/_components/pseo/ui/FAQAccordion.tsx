/**
 * FAQ Accordion Component
 * Based on PRD-PSEO-05 Section 4.2: FAQ Accordion
 * Client component for interactive collapse/expand
 */

'use client';

import { ReactElement } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface IFAQAccordionProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function FAQAccordion({
  question,
  answer,
  isOpen,
  onToggle,
}: IFAQAccordionProps): ReactElement {
  return (
    <div className="glass-card hover:border-border transition-colors">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 text-left group"
        aria-expanded={isOpen}
      >
        <h3 className="text-lg font-semibold text-text-primary pr-8 flex-1">{question}</h3>
        <div
          className={`flex-shrink-0 w-6 h-6 flex items-center justify-center transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        >
          <svg
            className="w-6 h-6 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && (
        <div className="px-6 pb-6 pt-0">
          <MarkdownRenderer
            content={answer}
            className="prose prose-invert prose-slate max-w-none prose-p:text-gray-300 prose-strong:text-white prose-a:text-accent"
          />
        </div>
      )}
    </div>
  );
}
