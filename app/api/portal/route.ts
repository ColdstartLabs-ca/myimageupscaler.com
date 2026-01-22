import { NextRequest } from 'next/server';
import { CheckoutController } from '@server/controllers';

const controller = new CheckoutController();

export async function POST(request: NextRequest) {
  return controller.execute(request);
}
