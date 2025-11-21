import React from 'react';
import { FaGoogle } from 'react-icons/fa';
import { useGoogleSignIn } from '../../hooks/useGoogleSignIn';

export const GoogleSignInButton: React.FC = () => {
  const { signIn, loading } = useGoogleSignIn();

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="w-full px-4 py-2 flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FaGoogle />
      {loading ? 'Signing in...' : 'Continue with Google'}
    </button>
  );
};
