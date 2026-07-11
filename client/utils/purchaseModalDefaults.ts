import type { ICreditPack, IPlanConfig } from '@shared/config/subscription.types';

export type TPurchaseMode = 'credits' | 'subscribe';
const REPEAT_PURCHASE_CONTEXT_KEY = 'miu_repeat_purchase';

export function setRepeatPurchaseContext(userId: string, packKey: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  const key = `${REPEAT_PURCHASE_CONTEXT_KEY}:${userId}`;
  if (packKey && ['small', 'medium', 'large'].includes(packKey)) {
    sessionStorage.setItem(key, packKey);
  } else {
    sessionStorage.removeItem(key);
  }
}

export function getRepeatPurchaseContext(userId: string | undefined): string | null {
  if (!userId || typeof sessionStorage === 'undefined') return null;
  const value = sessionStorage.getItem(`${REPEAT_PURCHASE_CONTEXT_KEY}:${userId}`);
  return value && ['small', 'medium', 'large'].includes(value) ? value : null;
}

export interface IPurchaseModalInitialSelection {
  purchaseMode: TPurchaseMode;
  selectedPack: ICreditPack | null;
  selectedPlan: IPlanConfig | null;
  lockToCredits: boolean;
}

export interface IPurchaseModalBanditConfig {
  defaultType?: 'credit_pack' | 'subscription';
  defaultKey?: string;
  visiblePacks?: string[];
  hideSubscriptionsInitially?: boolean;
  layout?: string;
  copy?: string;
}

function getStarterPack(creditPacks: ICreditPack[]): ICreditPack | null {
  return creditPacks.find(pack => pack.key === 'small') || creditPacks[0] || null;
}

function getRecommendedPlan(subscriptionPlans: IPlanConfig[]): IPlanConfig | null {
  return subscriptionPlans.find(plan => plan.recommended) || subscriptionPlans[0] || null;
}

function isBatchLimitTrigger(trigger: string): boolean {
  return trigger === 'batch_limit' || trigger.includes('batch_limit');
}

export function getPurchaseModalInitialSelection({
  trigger,
  outOfCredits,
  creditPacks,
  subscriptionPlans,
  banditConfig,
  repeatPackKey,
}: {
  trigger: string;
  outOfCredits: boolean;
  creditPacks: ICreditPack[];
  subscriptionPlans: IPlanConfig[];
  banditConfig?: IPurchaseModalBanditConfig;
  repeatPackKey?: string | null;
}): IPurchaseModalInitialSelection {
  const starterPack = getStarterPack(creditPacks);

  const repeatPack = creditPacks.find(pack => pack.key === repeatPackKey);
  if (repeatPack) {
    return {
      purchaseMode: 'credits',
      selectedPack: repeatPack,
      selectedPlan: null,
      lockToCredits: false,
    };
  }

  if (banditConfig?.defaultType === 'credit_pack' || banditConfig?.defaultKey) {
    const selectedPack =
      creditPacks.find(pack => pack.key === banditConfig.defaultKey) || starterPack;

    return {
      purchaseMode: 'credits',
      selectedPack,
      selectedPlan: null,
      lockToCredits: false,
    };
  }

  if (banditConfig?.defaultType === 'subscription') {
    const selectedPlan =
      subscriptionPlans.find(plan => plan.key === banditConfig.defaultKey) ||
      getRecommendedPlan(subscriptionPlans);

    return {
      purchaseMode: 'subscribe',
      selectedPack: null,
      selectedPlan,
      lockToCredits: false,
    };
  }

  if (trigger === 'model_gate') {
    return {
      purchaseMode: 'credits',
      selectedPack: starterPack,
      selectedPlan: null,
      lockToCredits: true,
    };
  }

  if (isBatchLimitTrigger(trigger)) {
    const recommendedPlan = getRecommendedPlan(subscriptionPlans);
    if (recommendedPlan) {
      return {
        purchaseMode: 'subscribe',
        selectedPack: null,
        selectedPlan: recommendedPlan,
        lockToCredits: false,
      };
    }
  }

  // Pending job cost is not available at this modal boundary yet, so the out-of-credits
  // fallback is the smallest available pack.
  if (outOfCredits || trigger === 'out_of_credits' || trigger === 'insufficient_credits') {
    return {
      purchaseMode: 'credits',
      selectedPack: starterPack,
      selectedPlan: null,
      lockToCredits: false,
    };
  }

  return {
    purchaseMode: 'credits',
    selectedPack: starterPack,
    selectedPlan: null,
    lockToCredits: false,
  };
}
