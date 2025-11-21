import React from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../../../store/authStore';
import { useToastStore } from '../../../store/toastStore';
import { InputField } from '../../form/InputField';

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
  const { updatePassword } = useAuthStore();
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
    <form onSubmit={handleSubmit(onSubmitHandler)} className="flex flex-col space-y-6 p-6">
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
        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
      >
        Set New Password
      </button>
    </form>
  );
};
