import { InputField } from '@client/components/form/InputField';
import { useUserStore } from '@client/store/userStore';
import { useToastStore } from '@client/store/toastStore';
import React from 'react';
import { useForm } from 'react-hook-form';

interface ISetNewPasswordForm {
  newPassword: string;
  confirmPassword: string;
}

interface IProps {
  onClose: () => void;
}

export const ForgotPasswordSetNewPasswordForm: React.FC<IProps> = ({ onClose }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ISetNewPasswordForm>();
  const { updatePassword } = useUserStore();
  const { showToast } = useToastStore();

  const onSubmitHandler = async (data: ISetNewPasswordForm) => {
    try {
      if (data.newPassword !== data.confirmPassword) {
        showToast({ message: 'Passwords do not match', type: 'error' });
        return;
      }
      await updatePassword(data.newPassword);
      showToast({ message: 'Password updated successfully!', type: 'success' });
      onClose();
    } catch (error) {
      console.error('Error setting new password:', error);
      showToast({
        message: error instanceof Error ? error.message : 'Failed to update password',
        type: 'error',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmitHandler)} className="flex flex-col space-y-5">
      <p className="text-center text-muted-foreground text-sm mb-1">Enter your new password</p>
      <InputField
        {...register('newPassword', {
          required: 'New password is required',
          minLength: {
            value: 6,
            message: 'Password must be at least 6 characters',
          },
        })}
        type="password"
        placeholder="New Password"
        className="w-full"
        error={errors.newPassword?.message}
      />
      <InputField
        {...register('confirmPassword', {
          required: 'Please confirm your new password',
          validate: value => value === watch('newPassword') || 'The passwords do not match',
        })}
        type="password"
        placeholder="Confirm New Password"
        className="w-full"
        error={errors.confirmPassword?.message}
      />
      <button
        type="submit"
        className="w-full px-4 py-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-700 hover:via-violet-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 active:scale-[0.98] mt-2"
      >
        Set New Password
      </button>
    </form>
  );
};
