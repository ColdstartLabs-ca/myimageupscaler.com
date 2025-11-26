import React, { FormEventHandler } from 'react';
import { FieldErrors, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { registerSchema } from '@shared/validation/authValidationSchema';
import { InputField } from '@client/components/form/InputField';

export type IRegisterForm = z.infer<typeof registerSchema>;

interface IRegisterFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<IRegisterForm>;
  errors: FieldErrors<IRegisterForm>;
}

export const RegisterForm: React.FC<IRegisterFormProps> = ({ onSubmit, register, errors }) => {
  return (
    <form onSubmit={onSubmit} className="flex flex-col space-y-5">
      <p className="text-center text-muted-foreground text-sm mb-1">
        Create an account to continue
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
      <InputField
        {...register('passwordConfirmation')}
        type="password"
        placeholder="Confirm Password"
        className="w-full"
        error={errors.passwordConfirmation?.message}
      />
      <button
        type="submit"
        className="w-full px-4 py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] mt-2"
      >
        Create Account
      </button>
    </form>
  );
};
