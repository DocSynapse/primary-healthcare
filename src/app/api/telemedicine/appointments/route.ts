import { NextResponse } from "next/server";
import { z } from "zod";

import { getCrewSessionFromRequest } from "@/lib/server/crew-access-auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/telemedicine/audit";
import { sendWhatsAppNotification } from "@/lib/telemedicine/notifications";

import type { ApiResponse, AppointmentWithDetails } from "@/types/telemedicine.types";

const CreateAppointmentSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(60).optional().default(15),
  consultationType: z.enum(["VIDEO", "AUDIO", "CHAT"]).optional().default("VIDEO"),
  keluhanUtama: z.string().optional(),
  riwayatPenyakit: z.string().optional(),
  bpjsNomorSEP: z.string().optional(),
  patientName: z.string().optional(),
  patientPhone: z.string().optional(),
  doctorName: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const session = getCrewSessionFromRequest(request);
  if (!session) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, data: null, message: "Unauthorized", timestamp: new Date().toISOString() },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const doctorId = searchParams.get("doctorId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const appointments = await prisma.telemedicineAppointment.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status: status as never } : {}),
      ...(doctorId ? { doctorId } : {}),
    },
    include: { session: true },
    orderBy: { scheduledAt: "desc" },
    take: limit,
  });

  return NextResponse.json<ApiResponse<AppointmentWithDetails[]>>({
    success: true,
    data: appointments as AppointmentWithDetails[],
    message: `${appointments.length} appointment ditemukan`,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = getCrewSessionFromRequest(request);
  if (!session) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, data: null, message: "Unauthorized", timestamp: new Date().toISOString() },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        data: null,
        message: parsed.error.issues.map((e) => e.message).join(", "),
        timestamp: new Date().toISOString(),
      },
      { status: 400 }
    );
  }

  const { patientName, patientPhone, doctorName, ...appointmentData } = parsed.data;

  // Generate token unik untuk pasien join tanpa login
  const patientJoinToken = crypto.randomUUID();

  const appointment = await prisma.telemedicineAppointment.create({
    data: {
      ...appointmentData,
      patientPhone: patientPhone ?? null,
      patientJoinToken,
      createdByStaffId: session.username,
      scheduledAt: new Date(appointmentData.scheduledAt),
    },
    include: { session: true },
  });

  await createAuditLog({
    appointmentId: appointment.id,
    userId: session.username,
    action: AUDIT_ACTIONS.APPOINTMENT_CREATED,
    metadata: { doctorId: appointment.doctorId, scheduledAt: appointment.scheduledAt },
  });

  // Kirim notifikasi WhatsApp dengan link join (non-blocking)
  if (patientPhone && patientName && doctorName) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      console.warn("[Telemedicine] NEXT_PUBLIC_BASE_URL tidak di-set — notifikasi WhatsApp dilewati");
    }
    if (baseUrl) {
      const joinUrl = `${baseUrl}/join/${patientJoinToken}`;
      sendWhatsAppNotification({
        appointmentId: appointment.id,
        patientName,
        patientPhone,
        doctorName,
        scheduledAt: appointment.scheduledAt,
        consultationType: appointment.consultationType,
        joinUrl,
      }).catch((err) => console.warn("[WhatsApp] Notifikasi gagal:", err));
    }
  }

  return NextResponse.json<ApiResponse<AppointmentWithDetails>>(
    {
      success: true,
      data: appointment as AppointmentWithDetails,
      message: "Appointment berhasil dibuat",
      timestamp: new Date().toISOString(),
    },
    { status: 201 }
  );
}
