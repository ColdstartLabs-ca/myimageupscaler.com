import React from 'react';
import { FaMicrosoft } from 'react-icons/fa'; // Assuming you have a Microsoft icon
import { useAzureSignIn } from '@client/hooks/useAzureSignIn';

export const AzureSignInButton: React.FC = () => {
  const { signIn, loading } = useAzureSignIn();

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="w-full px-4 py-3 flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
    >
      <FaMicrosoft className="text-lg" />
      {loading ? 'Signing in...' : 'Continue with Azure'}
    </button>
  );
};
