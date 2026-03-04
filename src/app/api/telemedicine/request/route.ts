import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { emitTeleRequest } from '@/lib/telemedicine/socket-bridge';

export const runtime = 'nodejs';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nama, usia, hp, poli, bpjs, keluhan } = body;

    if (!nama || !hp || !keluhan) {
      return NextResponse.json({ ok: false, error: 'Field wajib tidak lengkap' }, { status: 400 });
    }

    const request = await prisma.telemedicineRequest.create({
      data: {
        nama: String(nama),
        usia: String(usia || '-'),
        hp: String(hp),
        poli: String(poli || 'Poli Umum'),
        bpjs: bpjs ? String(bpjs) : null,
        keluhan: String(keluhan),
      },
    });

    // Emit real-time ke dashboard
    emitTeleRequest(request);

    return NextResponse.json({ ok: true, id: request.id });
  } catch (err) {
    console.error('[Telemedicine] POST /request error:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const requests = await prisma.telemedicineRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ ok: true, requests });
  } catch (err) {
    console.error('[Telemedicine] GET /request error:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
