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
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('auth');

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
      t('messages.signedInSuccessfully'),
      showToast,
      close,
      t('messages.authenticationFailed')
    );
  };

  const onRegisterSubmit = async (data: IRegisterForm) => {
    try {
      const result = await signUpWithEmail(data.email, data.password);

      if (result.emailConfirmationRequired) {
        showToast({
          message: t('messages.pleaseCheckEmail'),
          type: 'success',
        });
        close();
        window.location.href = '/verify-email';
      } else {
        showToast({ message: t('messages.accountCreated'), type: 'success' });
        close();
        // onAuthStateChange handles redirect to dashboard
      }
    } catch (error) {
      console.error('Registration error:', error);
      showToast({
        message: error instanceof Error ? error.message : t('messages.registrationFailed'),
        type: 'error',
      });
    }
  };

  const handleChangePassword = async (data: { currentPassword: string; newPassword: string }) => {
    await handleAuthAction(
      () => changePassword(data.currentPassword, data.newPassword),
      t('messages.passwordChanged'),
      showToast,
      close,
      t('messages.changePasswordFailed')
    );
  };

  const handleForgotPassword = async (data: { email: string }) => {
    await handleAuthAction(
      () => resetPassword(data.email),
      t('messages.resetLinkSent'),
      showToast,
      close,
      t('messages.sendResetLinkFailed')
    );
  };

  const getModalTitle = (): string => {
    const titles: Record<AuthModalView, string> = {
      login: t('modal.signIn'),
      register: t('modal.createAccount'),
      changePassword: t('modal.changePassword'),
      forgotPassword: t('modal.forgotPassword'),
      setNewPassword: t('modal.setNewPassword'),
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
              {t('modal.backToLogin')}
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
                {t('modal.alreadyHaveAccount')}
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
                {t('modal.dontHaveAccount')}
              </button>
              <button
                type="button"
                onClick={() => setAuthModalView('forgotPassword')}
                className="text-muted-foreground text-center hover:text-foreground font-medium w-full text-sm transition-colors duration-200 py-2 rounded-lg hover:bg-muted/30"
              >
                {t('modal.forgotPasswordLink')}
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
