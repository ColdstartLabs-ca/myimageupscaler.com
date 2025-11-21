import React from 'react';
import { useForm } from 'react-hook-form';
import { useToastStore } from '../../../store/toastStore';
import { InputField } from '../../form/InputField';

interface IChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export const ChangePasswordForm: React.FC<{ onSubmit: (data: IChangePasswordForm) => void }> = ({
  onSubmit,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<IChangePasswordForm>();
  const { showToast } = useToastStore();

  const onSubmitHandler = async (data: IChangePasswordForm) => {
    if (data.newPassword !== data.confirmPassword) {
      showToast({ message: 'Passwords do not match', type: 'error' });
      return;
    }
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmitHandler)} className="flex flex-col space-y-4">
      <InputField
        {...register('currentPassword', {
          required: 'Current password is required',
        })}
        type="password"
        placeholder="Current Password"
        className="w-full"
        error={errors.currentPassword?.message}
      />
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
        className="w-full px-4 py-3 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors shadow-sm hover:shadow-md"
      >
        Change Password
      </button>
    </form>
  );
};
