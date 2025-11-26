import { SocialLoginButton } from '@client/components/form/SocialLoginButton';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@server/supabase/supabaseClient';
import { useAuthStore } from '@client/store/authStore';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { loginSchema, registerSchema } from '@shared/validation/authValidationSchema';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '@client/components/modal/Modal';
import { ChangePasswordForm } from '@client/components/modal/auth/ChangePasswordForm';
import { ForgotPasswordForm } from '@client/components/modal/auth/ForgotPasswordForm';
import { ForgotPasswordSetNewPasswordForm } from '@client/components/modal/auth/ForgotPasswordSetNewPasswordForm';
import { ILoginForm, LoginForm } from '@client/components/modal/auth/LoginForm';
import { IRegisterForm, RegisterForm } from '@client/components/modal/auth/RegisterForm';

const MODAL_ID = 'authenticationModal';

export const AuthenticationModal: React.FC = () => {
  const { close: closeModal, isModalOpen, open } = useModalStore();
  const { signInWithEmail, signUpWithEmail, changePassword, resetPassword, isAuthenticated, user } =
    useAuthStore();
  const { showToast } = useToastStore();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isSettingNewPassword, setIsSettingNewPassword] = useState(false);

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
  } = useForm<IRegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const isOpen = isModalOpen(MODAL_ID);
  const isPasswordUser = user?.provider === 'email';

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsSettingNewPassword(true);
        open(MODAL_ID);
      } else if (event === 'SIGNED_OUT') {
        setIsSettingNewPassword(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [open]);

  useEffect(() => {
    if (isOpen && isAuthenticated && !isSettingNewPassword) {
      setIsChangingPassword(isPasswordUser);
    } else {
      setIsChangingPassword(false);
    }
  }, [isOpen, isAuthenticated, isSettingNewPassword, isPasswordUser]);

  const close = () => {
    setIsSettingNewPassword(false);
    closeModal();
  };

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

  const handleBackToLogin = () => {
    setIsForgotPassword(false);
    setIsRegistering(false);
  };

  const getModalTitle = () => {
    if (isRegistering) return 'Create Account';
    if (isChangingPassword) return 'Change Password';
    if (isForgotPassword) return 'Forgot Password';
    if (isSettingNewPassword) return 'Set New Password';
    return 'Sign In';
  };

  const getContentKey = () => {
    if (isChangingPassword && isPasswordUser) return 'change-password';
    if (isSettingNewPassword) return 'set-new-password';
    if (isForgotPassword) return 'forgot-password';
    if (isRegistering) return 'register';
    return 'login';
  };

  return (
    <div className="font-sans">
      <Modal title={getModalTitle()} onClose={close} isOpen={isOpen} showCloseButton={false}>
        <div key={getContentKey()} className="animate-in fade-in duration-200">
          {isChangingPassword && isPasswordUser ? (
            <ChangePasswordForm onSubmit={handleChangePassword} />
          ) : isSettingNewPassword ? (
            <ForgotPasswordSetNewPasswordForm onClose={close} />
          ) : isForgotPassword ? (
            <>
              <ForgotPasswordForm onSubmit={handleForgotPassword} />
              <button
                type="button"
                onClick={handleBackToLogin}
                className="text-primary text-center hover:text-primary-hover font-medium w-full mt-6 text-sm transition-colors duration-200 py-2 rounded-lg hover:bg-muted/30"
              >
                Back to Login
              </button>
            </>
          ) : (
            <>
              {isRegistering ? (
                <RegisterForm
                  onSubmit={handleRegisterSubmit(onRegisterSubmit)}
                  register={registerRegister}
                  errors={registerErrors}
                />
              ) : (
                <LoginForm
                  onSubmit={handleLoginSubmit(onLoginSubmit)}
                  register={loginRegister}
                  errors={loginErrors}
                />
              )}
              <SocialLoginButton />
              <div className="flex flex-col gap-2 mt-6 border-t border-border/50 pt-5">
                <button
                  type="button"
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="text-primary text-center hover:text-primary-hover font-medium w-full text-sm transition-colors duration-200 py-2 rounded-lg hover:bg-muted/30"
                >
                  {isRegistering
                    ? 'Already have an account? Sign in'
                    : "Don't have an account? Create one"}
                </button>
                {!isRegistering && (
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-primary text-center hover:text-primary-hover font-medium w-full text-sm transition-colors duration-200 py-2 rounded-lg hover:bg-muted/30"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};
