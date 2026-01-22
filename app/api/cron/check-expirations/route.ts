import { NextRequest } from 'next/server';
import { CronController } from '@server/controllers';

const controller = new CronController();

export async function POST(request: NextRequest) {
  return controller.execute(request);
}
