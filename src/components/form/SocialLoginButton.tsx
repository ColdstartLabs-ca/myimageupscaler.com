import React from 'react';
import { AzureSignInButton } from './AzureSignInButton';
import { GoogleSignInButton } from './GoogleSignInButton';

export const SocialLoginButton: React.FC = () => {
  return (
    <div className="flex flex-col gap-3 mt-4">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-500">Or continue with</span>
        </div>
      </div>
      <GoogleSignInButton />
      <AzureSignInButton />
    </div>
  );
};
