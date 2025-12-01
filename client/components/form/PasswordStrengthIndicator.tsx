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

export const PasswordStrengthIndicator: React.FC<IPasswordStrengthIndicatorProps> = ({
  password,
}) => {
  const strength = useMemo(() => calculateStrength(password), [password]);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
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
      <p className={`text-xs font-medium ${strength.color}`}>{strength.label}</p>
    </div>
  );
};
