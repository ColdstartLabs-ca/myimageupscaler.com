'use client';

import React, { useState, useEffect } from 'react';
import { Download, Lightbulb } from 'lucide-react';
import { Modal } from '@client/components/ui/Modal';

export interface ICustomInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructions: string;
  onSave: (instructions: string) => void;
  placeholderPrompt?: string;
}

export const CustomInstructionsModal: React.FC<ICustomInstructionsModalProps> = ({
  isOpen,
  onClose,
  instructions,
  onSave,
  placeholderPrompt = 'Tell the AI exactly how to process your image...',
}) => {
  const [currentInstructions, setCurrentInstructions] = useState(instructions);
  const [isTemplateMode, setIsTemplateMode] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentInstructions(instructions);
      setIsTemplateMode(false);
    }
  }, [isOpen, instructions]);

  const handleSave = () => {
    onSave(currentInstructions);
    onClose();
  };

  const handleLoadTemplate = () => {
    setIsTemplateMode(true);
    // Example templates - in a real app these might come from a config file
    const templates = [
      'Enhance this image while preserving the original style and mood. Focus on improving clarity and reducing noise.',
      'Restore this old photo. Fix damage, improve colors, and enhance faces while maintaining the vintage feel.',
      'Make this product photo look professional. Remove background distractions and enhance product details.',
      'Improve this portrait. Focus on skin smoothing while maintaining natural texture and enhancing eyes.',
      'Enhance this architectural photo. Improve sharpness, correct perspective, and enhance lighting.',
    ];

    // For now, just use the first template
    // In a real implementation, you might show a template selector
    setCurrentInstructions(templates[0]);
  };

  const characterCount = currentInstructions.length;
  const maxCharacters = 2000;
  const isOverLimit = characterCount > maxCharacters;

  // Sample templates for demonstration
  const sampleTemplates = [
    {
      title: 'General Enhancement',
      prompt:
        'Enhance this image while preserving the original style and mood. Focus on improving clarity and reducing noise.',
    },
    {
      title: 'Photo Restoration',
      prompt:
        'Restore this old photo. Fix damage, improve colors, and enhance faces while maintaining the vintage feel.',
    },
    {
      title: 'Product Photography',
      prompt:
        'Make this product photo look professional. Remove background distractions and enhance product details.',
    },
    {
      title: 'Portrait Enhancement',
      prompt:
        'Improve this portrait. Focus on skin smoothing while maintaining natural texture and enhancing eyes.',
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Custom Instructions"
      size="lg"
      showCloseButton={true}
    >
      <div className="space-y-4">
        {/* Description */}
        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Custom AI Instructions</p>
            <p className="text-blue-700">
              Tell the AI exactly how to process your image. Be specific about what you want to
              enhance, preserve, or change.
            </p>
          </div>
        </div>

        {/* Textarea */}
        <div>
          <label
            htmlFor="custom-instructions-textarea"
            className="block text-sm font-medium text-slate-700 mb-2"
          >
            Your Instructions
          </label>
          <textarea
            id="custom-instructions-textarea"
            value={currentInstructions}
            onChange={e => setCurrentInstructions(e.target.value)}
            placeholder={placeholderPrompt}
            className={`
              w-full min-h-[200px] p-3 rounded-lg border border-slate-200 text-sm
              focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
              resize-none transition-colors
              ${isOverLimit ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}
            `}
            maxLength={maxCharacters}
          />

          {/* Character count */}
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs ${isOverLimit ? 'text-red-600' : 'text-slate-500'}`}>
              {characterCount} / {maxCharacters} characters
              {isOverLimit && (
                <span className="ml-2 text-red-600 font-medium">
                  (Please reduce to {maxCharacters} characters)
                </span>
              )}
            </span>

            {isOverLimit && <span className="text-xs text-red-600">Character limit exceeded</span>}
          </div>
        </div>

        {/* Template Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Quick Templates</span>
            <button
              type="button"
              onClick={handleLoadTemplate}
              className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <Download className="h-3 w-3" />
              Load Template
            </button>
          </div>

          {isTemplateMode && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-medium text-amber-800 mb-2">Template loaded!</p>
              <p className="text-xs text-amber-700">
                A sample template has been loaded above. Feel free to modify it or replace it with
                your own instructions.
              </p>
            </div>
          )}

          {/* Template Examples */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {sampleTemplates.map((template, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentInstructions(template.prompt)}
                className="p-2 text-left border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <div className="text-xs font-medium text-slate-700 mb-1">{template.title}</div>
                <div className="text-xs text-slate-500 line-clamp-2">{template.prompt}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isOverLimit || !currentInstructions.trim()}
            className={`
              px-4 py-2 text-sm font-medium rounded-lg transition-colors
              ${
                isOverLimit || !currentInstructions.trim()
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
              }
            `}
          >
            Save Instructions
          </button>
        </div>
      </div>
    </Modal>
  );
};
