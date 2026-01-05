'use client';

import { SocialLoginButton } from '@client/components/form/SocialLoginButton';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@shared/utils/supabase/client';
import { useUserStore } from '@client/store/userStore';
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

/**
 * Unified error handling for auth actions
 */
const handleAuthAction = async (
  action: () => Promise<void>,
  successMessage: string,
  showToast: (toast: { message: string; type: 'success' | 'error' }) => void,
  close: () => void,
  errorMessage = 'Authentication failed'
) => {
  try {
    await action();
    showToast({ message: successMessage, type: 'success' });
    close();
  } catch (error) {
    console.error('Authentication error:', error);
    showToast({
      message: error instanceof Error ? error.message : errorMessage,
      type: 'error',
    });
  }
};

export const AuthenticationModal: React.FC = () => {
  const { close, isModalOpen, authModalView, setAuthModalView, openAuthModal } = useModalStore();
  const { signInWithEmail, signUpWithEmail, changePassword, resetPassword } = useUserStore();
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

  // Listen for password recovery event to open the set new password form
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        openAuthModal('setNewPassword');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [openAuthModal]);

  const onLoginSubmit = async (data: ILoginForm) => {
    await handleAuthAction(
      () => signInWithEmail(data.email, data.password),
      'Signed in successfully!',
      showToast,
      close
    );
  };

  const onRegisterSubmit = async (data: IRegisterForm) => {
    try {
      const result = await signUpWithEmail(data.email, data.password);

      if (result.emailConfirmationRequired) {
        showToast({
          message: 'Please check your email to verify your account',
          type: 'success',
        });
        close();
        window.location.href = '/verify-email';
      } else {
        showToast({ message: 'Account created successfully!', type: 'success' });
        close();
        // onAuthStateChange handles redirect to dashboard
      }
    } catch (error) {
      console.error('Registration error:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Registration failed',
        type: 'error',
      });
    }
  };

  const handleChangePassword = async (data: { currentPassword: string; newPassword: string }) => {
    await handleAuthAction(
      () => changePassword(data.currentPassword, data.newPassword),
      'Password changed successfully!',
      showToast,
      close,
      'Failed to change password'
    );
  };

  const handleForgotPassword = async (data: { email: string }) => {
    await handleAuthAction(
      () => resetPassword(data.email),
      'Password reset link sent! Check your email.',
      showToast,
      close,
      'Failed to send reset link'
    );
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
              className="text-accent text-center hover:text-accent-hover font-medium w-full mt-6 text-sm transition-colors duration-200 py-2 rounded-lg hover:bg-muted/30"
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
      <Modal
        title={getModalTitle()}
        showLogo={true}
        onClose={close}
        isOpen={isOpen}
        showCloseButton={false}
        modalId={MODAL_ID}
      >
        <div key={authModalView} className="animate-in fade-in duration-200">
          {renderContent()}
        </div>
      </Modal>
    </div>
  );
};
