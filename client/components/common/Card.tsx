import React, { JSX } from 'react';

interface ICardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const Card = ({ title, children, className = '' }: ICardProps): JSX.Element => {
  return (
    <div
      className={`card bg-base-200/50 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300 ${className}`}
    >
      <div className="card-body">
        <h2 className="card-title text-primary font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
};
