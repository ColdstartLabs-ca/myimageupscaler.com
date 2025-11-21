import React from 'react';
import { FaMicrosoft } from 'react-icons/fa'; // Assuming you have a Microsoft icon
import { useAzureSignIn } from '../../hooks/useAzureSignIn';

export const AzureSignInButton: React.FC = () => {
  const { signIn, loading } = useAzureSignIn();

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="w-full px-4 py-2 flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FaMicrosoft />
      {loading ? 'Signing in...' : 'Continue with Azure'}
    </button>
  );
};
