import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';

const prisma = new PrismaClient();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.telemedicineRequest.update({
      where: { id },
      data: { status: 'HANDLED' },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Telemedicine] mark-handled error:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
