import React, { useEffect } from 'react';
import { useAuthStore } from '@client/store/authStore';

export const Logout: React.FC = () => {
  const { signOut } = useAuthStore();

  useEffect(() => {
    const performLogout = async () => {
      await signOut();
      // Optionally redirect the user after logout
      window.location.href = '/'; // Redirect to home or login page
    };

    performLogout();
  }, [signOut]);

  return <div>Logging out...</div>;
};
