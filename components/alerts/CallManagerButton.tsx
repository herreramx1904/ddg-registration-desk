"use client";
// STUB — owned by the Alerts agent (T8). Contract: button on the desk guest card; creates a help alert and then
// shows the alert's state ("Waiting for a manager…" / "NAME is coming") by polling.
export interface CallManagerButtonProps { registrationId: string | null; guestName: string; compact?: boolean }
export function CallManagerButton(props: CallManagerButtonProps) { void props; return null; }
