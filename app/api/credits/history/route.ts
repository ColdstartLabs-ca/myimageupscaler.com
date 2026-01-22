import { NextRequest } from 'next/server';
import { CreditsController } from '@server/controllers';

const controller = new CreditsController();

export async function GET(request: NextRequest) {
  return controller.execute(request);
}
