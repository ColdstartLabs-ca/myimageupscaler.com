import { NextRequest } from 'next/server';
import { AdminController } from '@server/controllers';

const controller = new AdminController();

export async function POST(request: NextRequest) {
  return controller.execute(request);
}
