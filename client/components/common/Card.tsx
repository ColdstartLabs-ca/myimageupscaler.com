import React, { JSX } from 'react';

interface ICardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const Card = ({ title, children, className = '' }: ICardProps): JSX.Element => {
  return (
    <div
      className={`bg-surface-light/50 backdrop-blur-sm rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 ${className}`}
    >
      <h2 className="text-lg font-bold text-accent mb-4">{title}</h2>
      {children}
    </div>
  );
};
