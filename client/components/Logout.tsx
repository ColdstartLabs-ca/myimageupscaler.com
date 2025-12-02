import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@client/store/authStore';

export const Logout: React.FC = () => {
  const { signOut } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const performLogout = async () => {
      await signOut();
      // Redirect to home or login page using Next.js router
      router.push('/');
    };

    performLogout();
  }, [signOut, router]);

  return <div>Logging out...</div>;
};
