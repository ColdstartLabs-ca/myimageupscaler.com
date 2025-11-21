import React from 'react';
import { FaFacebook } from 'react-icons/fa';
import { useFacebookSignIn } from '../../hooks/useFacebookSignIn';

export const FacebookSignInButton: React.FC = () => {
  const { signIn, loading } = useFacebookSignIn();

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="w-full px-4 py-2 flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FaFacebook />
      {loading ? 'Signing in...' : 'Continue with Facebook'}
    </button>
  );
};
