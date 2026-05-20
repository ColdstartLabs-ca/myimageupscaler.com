import type { ICreditPack, IPlanConfig } from '@shared/config/subscription.types';

export type TPurchaseMode = 'credits' | 'subscribe';

export interface IPurchaseModalInitialSelection {
  purchaseMode: TPurchaseMode;
  selectedPack: ICreditPack | null;
  selectedPlan: IPlanConfig | null;
  lockToCredits: boolean;
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
}: {
  trigger: string;
  outOfCredits: boolean;
  creditPacks: ICreditPack[];
  subscriptionPlans: IPlanConfig[];
}): IPurchaseModalInitialSelection {
  const starterPack = getStarterPack(creditPacks);

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
