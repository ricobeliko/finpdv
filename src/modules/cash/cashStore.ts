import { create } from 'zustand';
import { CashClosingSummary } from './types';
import { 
  getCashSessionsDb, 
  saveCashSessionDb, 
  getCashMovementsDb, 
  saveCashMovementDb,
  updateCashMovementDb,
  cancelSaleDb,
  getSaleItemsDb
} from '../../core/database/db';
import { useProductStore } from '../products/productStore';

export interface CashSession {
  id: string;
  userId: string;
  userName: string;
  openedAt: string;
  closedAt: string | null;
  initialCents: number;
  initialAmountCents?: number;
  finalCents: number | null;
  totalSalesCents: number;
  salesCashCents?: number;
  totalSupplementsCents: number;
  suppliesCents?: number;
  totalBleedsCents: number;
  withdrawsCents?: number;
  expectedCents: number;
  expectedDrawerCents?: number;
  differenceCents: number;
  isOpen: boolean;
  notes?: string;
}

export interface CashMovement {
  id: string;
  sessionId: string;
  type: 'SALE' | 'SUPPLEMENT' | 'BLEED' | 'REFUND' | 'REFUNDED_SALE' | string;
  amountCents: number;
  reason: string;
  timestamp: string;
}

interface CashState {
  currentSession: CashSession | null;
  sessions: CashSession[];
  movements: CashMovement[];
  initCash: (defaultUserId?: string, defaultUserName?: string) => Promise<void>;
  openSession: (initialCents: number, userId: string, userName: string) => Promise<void>;
  closeSession: (finalCents: number, notes?: string) => Promise<CashClosingSummary | null>;
  addMovement: (type: 'SALE' | 'SUPPLEMENT' | 'BLEED' | 'REFUND' | string, amountCents: number, reason: string, customId?: string) => Promise<void>;
  refundMovement: (movement: CashMovement, reasonText?: string) => Promise<void>;
  getExpectedDrawerCents: () => number;
  getSalesCashCents: () => number;
  getSuppliesCents: () => number;
  getWithdrawsCents: () => number;
}

let autoCloseInterval: any = null;

function isSameDay(dateStr: string): boolean {
  if (!dateStr) return true;
  try {
    const [dPart] = dateStr.split(/[, ]+/);
    if (dPart.includes('/')) {
      const [d, m, y] = dPart.split('/').map(Number);
      const opened = new Date(y, m - 1, d);
      const now = new Date();
      return (
        opened.getFullYear() === now.getFullYear() &&
        opened.getMonth() === now.getMonth() &&
        opened.getDate() === now.getDate()
      );
    }
  } catch {
    return true;
  }
  return true;
}

export const useCashStore = create<CashState>((set, get) => ({
  currentSession: null,
  sessions: [],
  movements: [],

  getExpectedDrawerCents: () => {
    const s = get().currentSession;
    if (!s) return 0;
    const initial = s.initialCents ?? s.initialAmountCents ?? 0;
    const sales = s.totalSalesCents ?? s.salesCashCents ?? 0;
    const supp = s.totalSupplementsCents ?? s.suppliesCents ?? 0;
    const bleeds = s.totalBleedsCents ?? s.withdrawsCents ?? 0;
    return initial + sales + supp - bleeds;
  },

  getSalesCashCents: () => {
    const s = get().currentSession;
    return s ? (s.totalSalesCents ?? s.salesCashCents ?? 0) : 0;
  },

  getSuppliesCents: () => {
    const s = get().currentSession;
    return s ? (s.totalSupplementsCents ?? s.suppliesCents ?? 0) : 0;
  },

  getWithdrawsCents: () => {
    const s = get().currentSession;
    return s ? (s.totalBleedsCents ?? s.withdrawsCents ?? 0) : 0;
  },

  initCash: async (defaultUserId = 'usr-admin', defaultUserName = 'Administrador') => {
    try {
      const allSessions: any[] = await getCashSessionsDb();
      const open = allSessions.find(s => s.isOpen === true || s.isOpen === 1);

      let active: CashSession | null = null;

      if (open) {
        active = {
          ...open,
          initialAmountCents: open.initialCents ?? open.initialAmountCents ?? 0,
          salesCashCents: open.totalSalesCents ?? open.salesCashCents ?? 0,
          suppliesCents: open.totalSupplementsCents ?? open.suppliesCents ?? 0,
          withdrawsCents: open.totalBleedsCents ?? open.withdrawsCents ?? 0,
          expectedDrawerCents: open.expectedCents ?? open.expectedDrawerCents ?? 0,
          isOpen: true
        };

        if (!isSameDay(active.openedAt)) {
          const expected = active.expectedCents || 0;
          await get().closeSession(expected, 'Fechamento Automático de Meia-Noite');
          await get().openSession(0, defaultUserId, defaultUserName);
          return;
        }
      } else {
        const newSession: CashSession = {
          id: `CX-${Date.now()}`,
          userId: defaultUserId,
          userName: defaultUserName,
          openedAt: new Date().toLocaleString('pt-BR'),
          closedAt: null,
          initialCents: 0,
          initialAmountCents: 0,
          finalCents: null,
          totalSalesCents: 0,
          salesCashCents: 0,
          totalSupplementsCents: 0,
          suppliesCents: 0,
          totalBleedsCents: 0,
          withdrawsCents: 0,
          expectedCents: 0,
          expectedDrawerCents: 0,
          differenceCents: 0,
          isOpen: true,
          notes: 'Abertura Automática de Sistema'
        };
        await saveCashSessionDb(newSession);
        active = newSession;
        allSessions.unshift(newSession);
      }

      if (active) {
        const movs: any[] = await getCashMovementsDb(active.id);

        const validSalesCash = movs
          .filter(m => m.type === 'SALE')
          .reduce((sum, m) => sum + (m.amountCents || 0), 0);

        const validSupps = movs
          .filter(m => m.type === 'SUPPLEMENT')
          .reduce((sum, m) => sum + (m.amountCents || 0), 0);

        const validBleeds = movs
          .filter(m => m.type === 'BLEED')
          .reduce((sum, m) => sum + (m.amountCents || 0), 0);

        const initial = active.initialCents ?? active.initialAmountCents ?? 0;
        const expected = initial + validSalesCash + validSupps - validBleeds;

        active.totalSalesCents = validSalesCash;
        active.salesCashCents = validSalesCash;
        active.totalSupplementsCents = validSupps;
        active.suppliesCents = validSupps;
        active.totalBleedsCents = validBleeds;
        active.withdrawsCents = validBleeds;
        active.expectedCents = expected;
        active.expectedDrawerCents = expected;

        await saveCashSessionDb(active);

        set({
          currentSession: active,
          sessions: allSessions.map(s => s.id === active?.id ? active : s),
          movements: movs
        });
      }

      if (!autoCloseInterval) {
        autoCloseInterval = setInterval(async () => {
          const state = get();
          if (state.currentSession && state.currentSession.isOpen) {
            if (!isSameDay(state.currentSession.openedAt)) {
              const expected = state.getExpectedDrawerCents();
              await state.closeSession(expected, 'Fechamento Automático de Meia-Noite');
              await state.openSession(0, defaultUserId, defaultUserName);
            }
          }
        }, 15000);
      }
    } catch (err) {
      console.error('Erro ao inicializar caixa:', err);
    }
  },

  openSession: async (initialCents, userId, userName) => {
    const newSession: CashSession = {
      id: `CX-${Date.now()}`,
      userId,
      userName,
      openedAt: new Date().toLocaleString('pt-BR'),
      closedAt: null,
      initialCents,
      initialAmountCents: initialCents,
      finalCents: null,
      totalSalesCents: 0,
      salesCashCents: 0,
      totalSupplementsCents: 0,
      suppliesCents: 0,
      totalBleedsCents: 0,
      withdrawsCents: 0,
      expectedCents: initialCents,
      expectedDrawerCents: initialCents,
      differenceCents: 0,
      isOpen: true,
      notes: ''
    };

    await saveCashSessionDb(newSession);
    set(state => ({
      currentSession: newSession,
      sessions: [newSession, ...state.sessions],
      movements: []
    }));
  },

  closeSession: async (finalCents, notes = '') => {
    const current = get().currentSession;
    if (!current) return null;

    const expected = get().getExpectedDrawerCents();
    const differenceCents = finalCents - expected;
    const closed: CashSession = {
      ...current,
      closedAt: new Date().toLocaleString('pt-BR'),
      finalCents,
      differenceCents,
      isOpen: false,
      notes
    };

    await saveCashSessionDb(closed);

    set(state => ({
      currentSession: null,
      sessions: state.sessions.map(s => s.id === closed.id ? closed : s)
    }));

    const summary: CashClosingSummary = {
      sessionId: closed.id,
      openedAt: closed.openedAt,
      closedAt: closed.closedAt || '',
      userName: closed.userName,
      initialAmountCents: closed.initialCents ?? closed.initialAmountCents ?? 0,
      salesCashCents: closed.totalSalesCents ?? closed.salesCashCents ?? 0,
      suppliesCents: closed.totalSupplementsCents ?? closed.suppliesCents ?? 0,
      withdrawsCents: closed.totalBleedsCents ?? closed.withdrawsCents ?? 0,
      expectedDrawerCents: expected,
      countedCents: finalCents,
      differenceCents: differenceCents
    };

    return summary;
  },

  addMovement: async (type, amountCents, reason, customId) => {
    let current = get().currentSession;
    if (!current || !current.isOpen) {
      await get().initCash();
      current = get().currentSession;
    }
    if (!current) return;

    const movementId = customId || `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const movement: CashMovement = {
      id: movementId,
      sessionId: current.id,
      type,
      amountCents,
      reason,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    await saveCashMovementDb(movement);

    const updatedMovements = await getCashMovementsDb(current.id);

    const validSalesCash = updatedMovements
      .filter(m => m.type === 'SALE')
      .reduce((sum, m) => sum + (m.amountCents || 0), 0);

    const validSupps = updatedMovements
      .filter(m => m.type === 'SUPPLEMENT')
      .reduce((sum, m) => sum + (m.amountCents || 0), 0);

    const validBleeds = updatedMovements
      .filter(m => m.type === 'BLEED')
      .reduce((sum, m) => sum + (m.amountCents || 0), 0);

    const initial = current.initialCents ?? current.initialAmountCents ?? 0;
    const expected = initial + validSalesCash + validSupps - validBleeds;

    const updatedSession: CashSession = {
      ...current,
      totalSalesCents: validSalesCash,
      salesCashCents: validSalesCash,
      totalSupplementsCents: validSupps,
      suppliesCents: validSupps,
      totalBleedsCents: validBleeds,
      withdrawsCents: validBleeds,
      expectedCents: expected,
      expectedDrawerCents: expected
    };

    await saveCashSessionDb(updatedSession);

    set(state => ({
      currentSession: updatedSession,
      movements: updatedMovements,
      sessions: state.sessions.map(s => s.id === updatedSession.id ? updatedSession : s)
    }));
  },

  refundMovement: async (origMovement: CashMovement, reasonText = '') => {
    let current = get().currentSession;
    if (!current || !current.isOpen) return;
    if (origMovement.type === 'REFUNDED_SALE' || origMovement.type === 'REFUND') return;

    const match = origMovement.reason.match(/#([A-Z0-9_-]+)/i);
    if (match && match[1]) {
      const saleId = match[1];
      try {
        const saleItems = await getSaleItemsDb(saleId);
        if (saleItems && saleItems.length > 0) {
          await useProductStore.getState().returnStockFromRefund(saleItems, saleId);
        }
        await cancelSaleDb(saleId);
      } catch (err) {
        console.warn('Venda não localizada para exclusão:', err);
      }
    }

    const updatedReason = origMovement.reason.includes('[ESTORNADO]') 
      ? origMovement.reason 
      : `${origMovement.reason} [ESTORNADO]`;
    await updateCashMovementDb(origMovement.id, 'REFUNDED_SALE', updatedReason);

    const refundMovement: CashMovement = {
      id: `mov-ref-${origMovement.id}`,
      sessionId: current.id,
      type: 'REFUND',
      amountCents: origMovement.amountCents,
      reason: `ESTORNO: ${origMovement.reason}${reasonText ? ` (${reasonText})` : ''}`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    await saveCashMovementDb(refundMovement);

    const updatedMovements = await getCashMovementsDb(current.id);

    const validSalesCash = updatedMovements
      .filter(m => m.type === 'SALE')
      .reduce((sum, m) => sum + (m.amountCents || 0), 0);

    const validSupps = updatedMovements
      .filter(m => m.type === 'SUPPLEMENT')
      .reduce((sum, m) => sum + (m.amountCents || 0), 0);

    const validBleeds = updatedMovements
      .filter(m => m.type === 'BLEED')
      .reduce((sum, m) => sum + (m.amountCents || 0), 0);

    const initial = current.initialCents ?? current.initialAmountCents ?? 0;
    const expected = initial + validSalesCash + validSupps - validBleeds;

    const updatedSession: CashSession = {
      ...current,
      totalSalesCents: validSalesCash,
      salesCashCents: validSalesCash,
      expectedCents: expected,
      expectedDrawerCents: expected
    };
    await saveCashSessionDb(updatedSession);

    set(state => ({
      currentSession: updatedSession,
      movements: updatedMovements,
      sessions: state.sessions.map(s => s.id === updatedSession.id ? updatedSession : s)
    }));
  }
}));