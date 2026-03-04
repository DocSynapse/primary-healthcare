import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getCrewSessionFromRequest } from '@/lib/server/crew-access-auth';

export const runtime = 'nodejs';

const prisma = new PrismaClient();

// Public — website fetch ini untuk tampil badge dokter online
export async function GET() {
  try {
    const doctors = await prisma.doctorStatus.findMany({
      where: { isOnline: true },
      select: { doctorName: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ ok: true, doctors });
  } catch (err) {
    console.error('[Telemedicine] GET /doctor-status error:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// Toggle online/offline — hanya dokter (nama mengandung dr. atau drg.)
export async function POST(req: NextRequest) {
  try {
    const session = getCrewSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const isDoctor = /^dr[g]?\./i.test(session.displayName);
    if (!isDoctor) {
      return NextResponse.json({ ok: false, error: 'Hanya dokter yang dapat mengubah status' }, { status: 403 });
    }

    const { isOnline } = await req.json();

    const status = await prisma.doctorStatus.upsert({
      where: { doctorName: session.displayName },
      update: { isOnline: Boolean(isOnline) },
      create: { doctorName: session.displayName, isOnline: Boolean(isOnline) },
    });

    return NextResponse.json({ ok: true, doctorName: status.doctorName, isOnline: status.isOnline });
  } catch (err) {
    console.error('[Telemedicine] POST /doctor-status error:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
