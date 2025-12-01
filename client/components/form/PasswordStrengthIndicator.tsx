import { Check, X } from 'lucide-react';
import React, { useMemo } from 'react';

interface IPasswordStrengthIndicatorProps {
  password: string;
}

interface IStrengthResult {
  score: number;
  label: string;
  color: string;
  bgColor: string;
}

interface IRequirement {
  label: string;
  met: boolean;
}

const calculateStrength = (password: string): IStrengthResult => {
  if (!password) {
    return { score: 0, label: '', color: '', bgColor: 'bg-slate-200' };
  }

  let score = 0;

  // Length checks
  if (password.length >= 6) score += 1;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;

  // Character variety checks
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  // Normalize to 0-4 scale
  const normalizedScore = Math.min(4, Math.floor(score / 1.75));

  const strengthLevels: IStrengthResult[] = [
    { score: 0, label: 'Too weak', color: 'text-red-600', bgColor: 'bg-red-500' },
    { score: 1, label: 'Weak', color: 'text-orange-600', bgColor: 'bg-orange-500' },
    { score: 2, label: 'Fair', color: 'text-yellow-600', bgColor: 'bg-yellow-500' },
    { score: 3, label: 'Good', color: 'text-lime-600', bgColor: 'bg-lime-500' },
    { score: 4, label: 'Strong', color: 'text-green-600', bgColor: 'bg-green-500' },
  ];

  return strengthLevels[normalizedScore];
};

const getRequirements = (password: string): IRequirement[] => {
  return [
    { label: 'At least 6 characters', met: password.length >= 6 },
    { label: 'Uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'Number (0-9)', met: /[0-9]/.test(password) },
    { label: 'Special character (!@#$...)', met: /[^a-zA-Z0-9]/.test(password) },
  ];
};

export const PasswordStrengthIndicator: React.FC<IPasswordStrengthIndicatorProps> = ({
  password,
}) => {
  const strength = useMemo(() => calculateStrength(password), [password]);
  const requirements = useMemo(() => getRequirements(password), [password]);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(index => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              index < strength.score + 1 ? strength.bgColor : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-medium ${strength.color}`}>{strength.label}</p>
        <p className="text-xs text-slate-400">
          {requirements.filter(r => r.met).length}/{requirements.length} requirements
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {requirements.map((req, index) => (
          <div
            key={index}
            className={`flex items-center gap-1 text-[11px] transition-colors duration-200 ${
              req.met ? 'text-green-600' : 'text-slate-400'
            }`}
          >
            {req.met ? (
              <Check size={10} className="shrink-0" />
            ) : (
              <X size={10} className="shrink-0" />
            )}
            <span className="truncate">{req.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
