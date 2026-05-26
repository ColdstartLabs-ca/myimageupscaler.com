import type { ICreditPack, IPlanConfig } from '@shared/config/subscription.types';

export type TPurchaseMode = 'credits' | 'subscribe';

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
}: {
  trigger: string;
  outOfCredits: boolean;
  creditPacks: ICreditPack[];
  subscriptionPlans: IPlanConfig[];
  banditConfig?: IPurchaseModalBanditConfig;
}): IPurchaseModalInitialSelection {
  const starterPack = getStarterPack(creditPacks);

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
