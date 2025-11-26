import React, { FormEventHandler } from 'react';
import { FieldErrors, UseFormRegister } from 'react-hook-form';
import { loginSchema } from '@shared/validation/authValidationSchema';
import { z } from 'zod';
import { InputField } from '@client/components/form/InputField';

export type ILoginForm = z.infer<typeof loginSchema>;

interface ILoginFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<ILoginForm>;
  errors: FieldErrors<ILoginForm>;
}

export const LoginForm: React.FC<ILoginFormProps> = ({ onSubmit, register, errors }) => {
  return (
    <form onSubmit={onSubmit} className="flex flex-col space-y-5">
      <p className="text-center text-muted-foreground text-sm mb-1">
        Sign in to your account to continue
      </p>
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
        className="w-full px-4 py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] mt-2"
      >
        Sign In
      </button>
    </form>
  );
};
