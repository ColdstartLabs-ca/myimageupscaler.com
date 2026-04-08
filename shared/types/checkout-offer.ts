export interface ICheckoutRescueOffer {
  offerToken: string;
  priceId: string;
  discountPercent: number;
  expiresAt: string;
}

export interface ICheckoutRescueOfferRequest {
  priceId: string;
}

export interface ICheckoutRescueOfferResponse {
  success: true;
  data: ICheckoutRescueOffer;
}
