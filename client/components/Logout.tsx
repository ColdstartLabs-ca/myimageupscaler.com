import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@client/store/userStore';

export const Logout: React.FC = () => {
  const { signOut } = useUserStore();
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
