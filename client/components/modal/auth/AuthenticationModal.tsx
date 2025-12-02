'use client';

import { SocialLoginButton } from '@client/components/form/SocialLoginButton';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@shared/utils/supabase/client';
import { useAuthStore } from '@client/store/authStore';
import { useModalStore, AuthModalView } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { loginSchema, registerSchema } from '@shared/validation/authValidationSchema';
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '@client/components/modal/Modal';
import { ChangePasswordForm } from '@client/components/modal/auth/ChangePasswordForm';
import { ForgotPasswordForm } from '@client/components/modal/auth/ForgotPasswordForm';
import { ForgotPasswordSetNewPasswordForm } from '@client/components/modal/auth/ForgotPasswordSetNewPasswordForm';
import { ILoginForm, LoginForm } from '@client/components/modal/auth/LoginForm';
import { IRegisterForm, RegisterForm } from '@client/components/modal/auth/RegisterForm';

const MODAL_ID = 'authenticationModal';

export const AuthenticationModal: React.FC = () => {
  const { close, isModalOpen, authModalView, setAuthModalView, openAuthModal } = useModalStore();
  const { signInWithEmail, signUpWithEmail, changePassword, resetPassword } = useAuthStore();
  const { showToast } = useToastStore();

  const {
    register: loginRegister,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useForm<ILoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register: registerRegister,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
    watch: registerWatch,
  } = useForm<IRegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const isOpen = isModalOpen(MODAL_ID);

  // Listen for auth state changes and handle intended purchases
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        openAuthModal('setNewPassword');
      } else if (event === 'SIGNED_IN' && session) {
        // Check if there's an intended purchase
        const intendedPurchase = sessionStorage.getItem('intendedPurchase');
        if (intendedPurchase) {
          try {
            const { priceId, successUrl, cancelUrl } = JSON.parse(intendedPurchase);
            sessionStorage.removeItem('intendedPurchase'); // Clean up

            // Redirect to Stripe checkout after successful auth
            const { StripeService } = await import('@server/stripe/stripeService');
            await StripeService.redirectToCheckout(priceId, {
              successUrl,
              cancelUrl,
            });
          } catch (error) {
            console.error('Error processing intended purchase:', error);
            sessionStorage.removeItem('intendedPurchase'); // Clean up on error
          }
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [openAuthModal]);

  const onLoginSubmit = async (data: ILoginForm) => {
    try {
      await signInWithEmail(data.email, data.password);
      showToast({ message: 'Signed in successfully!', type: 'success' });
      close();
    } catch (error) {
      console.error('Authentication error:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Authentication failed',
        type: 'error',
      });
    }
  };

  const onRegisterSubmit = async (data: IRegisterForm) => {
    try {
      await signUpWithEmail(data.email, data.password);
      showToast({ message: 'Account created successfully!', type: 'success' });
      close();
    } catch (error) {
      console.error('Authentication error:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Authentication failed',
        type: 'error',
      });
    }
  };

  const handleChangePassword = async (data: { currentPassword: string; newPassword: string }) => {
    try {
      await changePassword(data.currentPassword, data.newPassword);
      showToast({ message: 'Password changed successfully!', type: 'success' });
      close();
    } catch (error) {
      console.error('Change password error:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Failed to change password',
        type: 'error',
      });
    }
  };

  const handleForgotPassword = async (data: { email: string }) => {
    try {
      await resetPassword(data.email);
      showToast({ message: 'Password reset link sent! Check your email.', type: 'success' });
      close();
    } catch (error) {
      console.error('Reset password error:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Failed to send reset link',
        type: 'error',
      });
    }
  };

  const getModalTitle = (): string => {
    const titles: Record<AuthModalView, string> = {
      login: 'Sign In',
      register: 'Create Account',
      changePassword: 'Change Password',
      forgotPassword: 'Forgot Password',
      setNewPassword: 'Set New Password',
    };
    return titles[authModalView];
  };

  const renderContent = () => {
    switch (authModalView) {
      case 'changePassword':
        return <ChangePasswordForm onSubmit={handleChangePassword} />;

      case 'setNewPassword':
        return <ForgotPasswordSetNewPasswordForm onClose={close} />;

      case 'forgotPassword':
        return (
          <>
            <ForgotPasswordForm onSubmit={handleForgotPassword} />
            <button
              type="button"
              onClick={() => setAuthModalView('login')}
              className="text-primary text-center hover:text-primary-hover font-medium w-full mt-6 text-sm transition-colors duration-200 py-2 rounded-lg hover:bg-muted/30"
            >
              Back to Login
            </button>
          </>
        );

      case 'register':
        return (
          <>
            <RegisterForm
              onSubmit={handleRegisterSubmit(onRegisterSubmit)}
              register={registerRegister}
              errors={registerErrors}
              watch={registerWatch}
            />
            <SocialLoginButton />
            <div className="flex flex-col gap-2 mt-6 border-t border-border/50 pt-5">
              <button
                type="button"
                onClick={() => setAuthModalView('login')}
                className="text-muted-foreground text-center hover:text-foreground font-medium w-full text-sm transition-colors duration-200 py-2 rounded-lg hover:bg-muted/30"
              >
                Already have an account? Sign in
              </button>
            </div>
          </>
        );

      case 'login':
      default:
        return (
          <>
            <LoginForm
              onSubmit={handleLoginSubmit(onLoginSubmit)}
              register={loginRegister}
              errors={loginErrors}
            />
            <SocialLoginButton />
            <div className="flex flex-col gap-2 mt-6 border-t border-border/50 pt-5">
              <button
                type="button"
                onClick={() => setAuthModalView('register')}
                className="text-muted-foreground text-center hover:text-foreground font-medium w-full text-sm transition-colors duration-200 py-2 rounded-lg hover:bg-muted/30"
              >
                Don&apos;t have an account? Create one
              </button>
              <button
                type="button"
                onClick={() => setAuthModalView('forgotPassword')}
                className="text-muted-foreground text-center hover:text-foreground font-medium w-full text-sm transition-colors duration-200 py-2 rounded-lg hover:bg-muted/30"
              >
                Forgot Password?
              </button>
            </div>
          </>
        );
    }
  };

  return (
    <div className="font-sans">
      <Modal title={getModalTitle()} onClose={close} isOpen={isOpen} showCloseButton={false}>
        <div key={authModalView} className="animate-in fade-in duration-200">
          {renderContent()}
        </div>
      </Modal>
    </div>
  );
};
