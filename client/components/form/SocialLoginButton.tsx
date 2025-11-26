import React from 'react';
import { AzureSignInButton } from '@client/components/form/AzureSignInButton';
import { GoogleSignInButton } from '@client/components/form/GoogleSignInButton';

export const SocialLoginButton: React.FC = () => {
  return (
    <div className="flex flex-col gap-3 mt-6">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground font-medium">Or continue with</span>
        </div>
      </div>
      <GoogleSignInButton />
      <AzureSignInButton />
    </div>
  );
};
