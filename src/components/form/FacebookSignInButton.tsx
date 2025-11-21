import React from 'react';
import { FaFacebook } from 'react-icons/fa';
import { useFacebookSignIn } from '../../hooks/useFacebookSignIn';

export const FacebookSignInButton: React.FC = () => {
  const { signIn, loading } = useFacebookSignIn();

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="w-full px-4 py-3 flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
    >
      <FaFacebook className="text-lg" />
      {loading ? 'Signing in...' : 'Continue with Facebook'}
    </button>
  );
};
