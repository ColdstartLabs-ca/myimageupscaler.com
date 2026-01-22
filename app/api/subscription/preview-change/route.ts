import { NextRequest } from 'next/server';
import { SubscriptionController } from '@server/controllers';

const controller = new SubscriptionController();

export async function POST(request: NextRequest) {
  return controller.execute(request);
}
