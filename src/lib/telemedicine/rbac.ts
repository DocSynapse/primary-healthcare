// ============================================================
// PKM Dashboard — Telemedicine RBAC Helper
// ============================================================

import type { SessionParticipantRole } from "@/types/telemedicine.types";

interface AppointmentAccessFields {
  doctorId: string;
}

interface HasAccessParams {
  userId: string;
  userRole: string;
  appointment: AppointmentAccessFields;
  participantRole: SessionParticipantRole;
}

/**
 * Validasi apakah user boleh bergabung ke sesi telemedicine.
 *
 * Rules:
 * - DOKTER hanya bisa join sebagai DOCTOR dan harus dokter yang bertugas
 * - PERAWAT bisa join sebagai NURSE
 * - KEPALA_PUSKESMAS dan ADMIN bisa join sebagai OBSERVER
 */
export function hasTelemedicineAccess({
  userId,
  userRole,
  appointment,
  participantRole,
}: HasAccessParams): boolean {
  switch (userRole) {
    case "DOKTER":
      return participantRole === "DOCTOR" && appointment.doctorId === userId;

    case "PERAWAT":
      return participantRole === "NURSE";

    case "KEPALA_PUSKESMAS":
    case "ADMIN":
      return participantRole === "OBSERVER";

    default:
      return false;
  }
}

export const TELEMEDICINE_PERMISSIONS = {
  DOKTER: [
    "CREATE_APPOINTMENT",
    "JOIN_AS_DOCTOR",
    "WRITE_DIAGNOSIS",
    "CREATE_PRESCRIPTION",
    "REQUEST_REFERRAL",
    "VIEW_PATIENT_RECORD",
  ],
  PERAWAT: [
    "CREATE_APPOINTMENT",
    "JOIN_AS_NURSE",
    "VIEW_APPOINTMENT",
    "UPDATE_VITAL_SIGNS",
  ],
  KEPALA_PUSKESMAS: [
    "VIEW_ALL_APPOINTMENTS",
    "JOIN_AS_OBSERVER",
    "VIEW_STATISTICS",
    "EXPORT_REPORT",
  ],
  ADMIN: [
    "CREATE_APPOINTMENT",
    "CANCEL_APPOINTMENT",
    "VIEW_ALL_APPOINTMENTS",
    "JOIN_AS_OBSERVER",
    "MANAGE_SCHEDULES",
  ],
} as const;

export type TelemedicinePermission =
  (typeof TELEMEDICINE_PERMISSIONS)[keyof typeof TELEMEDICINE_PERMISSIONS][number];

export function canPerform(
  userRole: string,
  permission: TelemedicinePermission
): boolean {
  const allowed =
    TELEMEDICINE_PERMISSIONS[userRole as keyof typeof TELEMEDICINE_PERMISSIONS] ?? [];
  return (allowed as readonly string[]).includes(permission);
}
