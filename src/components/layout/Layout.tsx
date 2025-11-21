'use client';

import React, { JSX } from 'react';
import { LoadingBackdrop } from '../common/LoadingBackdrop';
import { NavBar } from '../navigation/NavBar';

interface ILayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: ILayoutProps): JSX.Element => {
  return (
    <div className="min-h-screen bg-white">
      <LoadingBackdrop />
      <div className="max-w-[1600px] mx-auto">
        <NavBar />
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </div>
    </div>
  );
};
