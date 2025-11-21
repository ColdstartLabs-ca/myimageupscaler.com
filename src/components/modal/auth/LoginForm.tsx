import React, { FormEventHandler } from 'react';
import { FieldErrors, UseFormRegister } from 'react-hook-form';
import { loginSchema } from 'src/validation/authValidationSchema';
import { z } from 'zod';
import { InputField } from '../../form/InputField';

export type ILoginForm = z.infer<typeof loginSchema>;

interface ILoginFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<ILoginForm>;
  errors: FieldErrors<ILoginForm>;
}

export const LoginForm: React.FC<ILoginFormProps> = ({ onSubmit, register, errors }) => {
  return (
    <form onSubmit={onSubmit} className="flex flex-col space-y-6 p-6">
      <p className="text-center text-gray-500">Sign in to your account to continue</p>
      <InputField
        {...register('email')}
        type="email"
        placeholder="Email address"
        className="w-full"
        error={errors.email?.message}
      />
      <InputField
        {...register('password')}
        type="password"
        placeholder="Password"
        className="w-full"
        error={errors.password?.message}
      />
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
      >
        Sign In
      </button>
    </form>
  );
};
