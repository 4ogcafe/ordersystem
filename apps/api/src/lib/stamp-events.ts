import { EventEmitter } from 'node:events';

export const stampEvents = new EventEmitter();
stampEvents.setMaxListeners(200);

export function emitStampAwarded(customerId: string, payload: unknown) {
  stampEvents.emit(`stamp:${customerId}`, payload);
}
