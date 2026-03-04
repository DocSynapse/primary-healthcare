/**
 * Telemedicine Socket Bridge
 * Emit real-time events ke dashboard saat ada request masuk dari website pasien.
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { TelemedicineRequest } from '@prisma/client';

let _io: SocketIOServer | null = null;

export function setTeleSocketIO(io: SocketIOServer): void {
  _io = io;
}

export function emitTeleRequest(request: TelemedicineRequest): void {
  if (!_io) return;
  _io.emit('telemedicine:new-request', request);
}
