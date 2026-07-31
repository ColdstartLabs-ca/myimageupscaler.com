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

export function getSmallestSufficientCreditPack(
  creditPacks: ICreditPack[],
  deficit: number
): ICreditPack | null {
  const purchasablePacks = creditPacks
    .filter(pack => pack.enabled && Boolean(pack.stripePriceId) && pack.credits > 0)
    .sort((a, b) => a.credits - b.credits);

  if (purchasablePacks.length === 0) return null;

  const requiredCredits = Math.max(0, deficit);
  return purchasablePacks.find(pack => pack.credits >= requiredCredits) || null;
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
  requiredCredits,
  currentBalance,
  experimentArmKey,
}: {
  trigger: string;
  outOfCredits: boolean;
  creditPacks: ICreditPack[];
  subscriptionPlans: IPlanConfig[];
  banditConfig?: IPurchaseModalBanditConfig;
  repeatPackKey?: string | null;
  requiredCredits?: number;
  currentBalance?: number;
  experimentArmKey?: string;
}): IPurchaseModalInitialSelection {
  const starterPack = getStarterPack(creditPacks);
  const isCreditWall =
    outOfCredits || trigger === 'out_of_credits' || trigger === 'insufficient_credits';
  const usesSufficientPackRecommendation =
    experimentArmKey === 'sufficient_pack_focus' || experimentArmKey === 'direct_sufficient_pack';

  if (
    isCreditWall &&
    usesSufficientPackRecommendation &&
    typeof requiredCredits === 'number' &&
    typeof currentBalance === 'number'
  ) {
    return {
      purchaseMode: 'credits',
      selectedPack: getSmallestSufficientCreditPack(
        creditPacks,
        Math.max(requiredCredits - currentBalance, 0)
      ),
      selectedPlan: null,
      lockToCredits: false,
    };
  }

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
  if (isCreditWall) {
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
