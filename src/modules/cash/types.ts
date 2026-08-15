export type CashMovementType = 'INITIAL' | 'SALE' | 'SUPPLY' | 'WITHDRAW' | 'CANCEL_SALE';

export interface CashMovement {
  id: string;
  sessionId: string;
  type: CashMovementType;
  amountCents: number;
  reason: string;
  timestamp: string;
  userId: string;
}

export interface CashSession {
  id: string;
  userId: string;
  userName: string;
  isOpen: boolean;
  openedAt: string;
  closedAt?: string;
  initialAmountCents: number;
}

export interface CashClosingSummary {
  sessionId: string;
  openedAt: string;
  closedAt: string;
  userName: string;
  initialAmountCents: number;
  salesCashCents: number;
  suppliesCents: number;
  withdrawsCents: number;
  expectedDrawerCents: number;
  countedCents: number;
  differenceCents: number;
}