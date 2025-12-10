import { OAuthButton } from '@client/components/form/OAuthButton';
import { useGoogleSignIn } from '@client/hooks/useGoogleSignIn';
import { getAndClearAuthIntent } from '@client/utils/authRedirectManager';
import React from 'react';
import { FaGoogle } from 'react-icons/fa';

export const GoogleSignInButton: React.FC = () => {
  const { signIn, loading } = useGoogleSignIn();

  const handleClick = async () => {
    // Check if we have a stored auth intent
    const intent = getAndClearAuthIntent();

    // Pass the returnTo URL to the sign-in function
    await signIn(intent?.returnTo);
  };

  return (
    <OAuthButton
      provider="Google"
      icon={<FaGoogle className="text-lg" />}
      loading={loading}
      onClick={handleClick}
    />
  );
};
