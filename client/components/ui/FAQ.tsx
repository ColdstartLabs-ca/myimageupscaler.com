'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export interface IFAQItem {
  question: string;
  answer: string;
}

export interface IFAQProps {
  items: IFAQItem[];
  className?: string;
  openIndex?: number | null;
  onToggle?: (index: number) => void;
}

export function FAQ({
  items,
  className = '',
  openIndex: controlledOpenIndex,
  onToggle: controlledOnToggle,
}: IFAQProps): JSX.Element {
  const [internalOpenIndex, setInternalOpenIndex] = useState<number | null>(null);

  // Use controlled or uncontrolled state
  const isControlled = controlledOpenIndex !== undefined && controlledOnToggle !== undefined;
  const openIndex = isControlled ? controlledOpenIndex : internalOpenIndex;
  const setOpenIndex = isControlled ? controlledOnToggle : setInternalOpenIndex;

  const toggleOpen = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className={`max-w-3xl mx-auto ${className}`}>
      {items.map((item, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="border-b border-white/10 last:border-0"
        >
          <button
            onClick={() => toggleOpen(index)}
            className="w-full py-6 text-left flex items-start justify-between gap-4 group"
            aria-expanded={openIndex === index}
          >
            <span className="text-lg font-semibold text-white group-hover:text-accent transition-colors">
              {item.question}
            </span>
            <ChevronDown
              className={`flex-shrink-0 mt-1 transition-transform duration-300 ${
                openIndex === index ? 'rotate-180 text-accent' : 'text-text-muted'
              }`}
              size={20}
            />
          </button>
          <motion.div
            initial={false}
            animate={{
              height: openIndex === index ? 'auto' : 0,
              opacity: openIndex === index ? 1 : 0,
            }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pb-6 text-text-secondary leading-relaxed">{item.answer}</div>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}
