/* eslint-disable @typescript-eslint/naming-convention */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: IGoogleIdConfiguration) => void;
          prompt: (callback?: (notification: IPromptNotification) => void) => void;
          renderButton: (parent: HTMLElement, options: IGsiButtonConfiguration) => void;
          disableAutoSelect: () => void;
          cancel: () => void;
        };
      };
    };
  }
}

interface IGoogleIdConfiguration {
  client_id: string;
  callback: (response: ICredentialResponse) => void;
  nonce?: string;
  use_fedcm_for_prompt?: boolean;
  context?: 'signin' | 'signup' | 'use';
  ux_mode?: 'popup' | 'redirect';
  auto_select?: boolean;
  itp_support?: boolean;
}

interface ICredentialResponse {
  credential: string;
  select_by: string;
  clientId?: string;
}

interface IPromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
  getDismissedReason: () => string;
}

interface IGsiButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

export {};
