"use client";
// STUB — owned by the Walk-ins agent (T5). Contract: a sheet/modal with the walk-in form + the desk's own pending list.
export interface WalkinSheetProps { open: boolean; onClose: () => void }
export function WalkinSheet(props: WalkinSheetProps) { void props; return null; }
/** Small strip for the desk screen showing this desk's pending/approved/rejected walk-ins (polls itself). */
export function DeskWalkinStatus() { return null; }
