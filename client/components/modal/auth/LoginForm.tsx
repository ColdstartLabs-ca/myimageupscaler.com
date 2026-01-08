import { InputField } from '@client/components/form/InputField';
import { loginSchema } from '@shared/validation/authValidationSchema';
import React, { FormEventHandler } from 'react';
import { FieldErrors, UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { useTranslations } from 'next-intl';

export type ILoginForm = z.infer<typeof loginSchema>;

interface ILoginFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<ILoginForm>;
  errors: FieldErrors<ILoginForm>;
}

export const LoginForm: React.FC<ILoginFormProps> = ({ onSubmit, register, errors }) => {
  const t = useTranslations('auth');

  return (
    <form onSubmit={onSubmit} className="flex flex-col space-y-5">
      <p className="text-center text-muted-foreground text-sm mb-1">
        Sign in to your account to continue
      </p>
      <InputField
        {...register('email')}
        type="email"
        placeholder={t('form.email')}
        className="w-full"
        error={errors.email?.message}
      />
      <InputField
        {...register('password')}
        type="password"
        placeholder={t('form.password')}
        className="w-full"
        error={errors.password?.message}
      />
      <button
        type="submit"
        className="w-full px-4 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-accent/25 hover:shadow-xl hover:shadow-accent/30 active:scale-[0.98] mt-2 glow-blue"
      >
        {t('common.signIn')}
      </button>
    </form>
  );
};
