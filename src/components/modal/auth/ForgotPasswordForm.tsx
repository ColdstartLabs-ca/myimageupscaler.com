import React from 'react';
import { useForm } from 'react-hook-form';
import { InputField } from '../../form/InputField';

interface IForgotPasswordForm {
  email: string;
}

interface IProps {
  onSubmit: (data: IForgotPasswordForm) => void;
}

export const ForgotPasswordForm: React.FC<IProps> = ({ onSubmit }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IForgotPasswordForm>();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col space-y-5">
      <p className="text-center text-muted-foreground text-sm mb-1">
        Enter your email to receive a password reset link
      </p>
      <InputField
        {...register('email', {
          required: 'Email is required',
          pattern: {
            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
            message: 'Invalid email address',
          },
        })}
        type="email"
        placeholder="Email Address"
        className="w-full"
        error={errors.email?.message}
      />
      <button
        type="submit"
        className="w-full px-4 py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] mt-2"
      >
        Send Reset Link
      </button>
    </form>
  );
};
