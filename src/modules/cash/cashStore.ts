import { create } from 'zustand';
import { CashClosingSummary, CashMovement, CashSession } from './types';
import { 
  getActiveCashSessionDb, 
  openCashSessionDb, 
  insertCashMovementDb, 
  closeCashSessionDb 
} from '../../core/database/db';

interface CashState {
  currentSession: CashSession | null;
  movements: CashMovement[];
  lastClosingSummary: CashClosingSummary | null;
  isLoading: boolean;

  initCash: () => Promise<void>;
  openSession: (initialAmountCents: number, userName?: string, userId?: string) => Promise<void>;
  addMovement: (type: 'SUPPLY' | 'WITHDRAW' | 'SALE', amountCents: number, reason: string) => Promise<void>;
  closeSession: (countedCents: number) => Promise<CashClosingSummary>;
  clearLastSummary: () => void;

  getExpectedDrawerCents: () => number;
  getSalesCashCents: () => number;
  getSuppliesCents: () => number;
  getWithdrawsCents: () => number;
}

export const useCashStore = create<CashState>((set, get) => ({
  currentSession: null,
  movements: [],
  lastClosingSummary: null,
  isLoading: false,

  initCash: async () => {
    set({ isLoading: true });
    try {
      const { session, movements } = await getActiveCashSessionDb();
      set({ currentSession: session, movements });
    } catch (err) {
      console.error('Erro ao restaurar caixa ativo:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  openSession: async (initialAmountCents, userName = 'Richard', userId = 'usr-1') => {
    const now = new Date().toLocaleString('pt-BR');
    const sessionId = `CX-${Date.now()}`;

    const newSession: CashSession = {
      id: sessionId,
      userId,
      userName,
      isOpen: true,
      openedAt: now,
      initialAmountCents,
    };

    const initialMovement: CashMovement = {
      id: `mov-${Date.now()}`,
      sessionId,
      type: 'INITIAL',
      amountCents: initialAmountCents,
      reason: 'Fundo de troco de abertura',
      timestamp: now,
      userId,
    };

    set({
      currentSession: newSession,
      movements: [initialMovement],
      lastClosingSummary: null,
    });

    try {
      await openCashSessionDb(newSession, initialMovement);
    } catch (err) {
      console.error('Erro ao gravar abertura de caixa no SQLite:', err);
    }
  },

  addMovement: async (type, amountCents, reason) => {
    const session = get().currentSession;
    if (!session || !session.isOpen) return;

    const newMov: CashMovement = {
      id: `mov-${Date.now()}-${Math.random()}`,
      sessionId: session.id,
      type,
      amountCents,
      reason,
      timestamp: new Date().toLocaleString('pt-BR'),
      userId: session.userId,
    };

    set((state) => ({
      movements: [newMov, ...state.movements],
    }));

    try {
      await insertCashMovementDb(newMov);
    } catch (err) {
      console.error('Erro ao gravar movimento no SQLite:', err);
    }
  },

  getSalesCashCents: () => {
    return get().movements
      .filter((m) => m.type === 'SALE')
      .reduce((sum, m) => sum + m.amountCents, 0);
  },

  getSuppliesCents: () => {
    return get().movements
      .filter((m) => m.type === 'SUPPLY')
      .reduce((sum, m) => sum + m.amountCents, 0);
  },

  getWithdrawsCents: () => {
    return get().movements
      .filter((m) => m.type === 'WITHDRAW')
      .reduce((sum, m) => sum + m.amountCents, 0);
  },

  getExpectedDrawerCents: () => {
    const session = get().currentSession;
    if (!session) return 0;

    const initial = session.initialAmountCents;
    const sales = get().getSalesCashCents();
    const supplies = get().getSuppliesCents();
    const withdraws = get().getWithdrawsCents();

    return initial + sales + supplies - withdraws;
  },

  closeSession: async (countedCents) => {
    const session = get().currentSession;
    if (!session) throw new Error('Nenhuma sessão aberta.');

    const expected = get().getExpectedDrawerCents();
    const diff = countedCents - expected;
    const now = new Date().toLocaleString('pt-BR');

    const summary: CashClosingSummary = {
      sessionId: session.id,
      openedAt: session.openedAt,
      closedAt: now,
      userName: session.userName,
      initialAmountCents: session.initialAmountCents,
      salesCashCents: get().getSalesCashCents(),
      suppliesCents: get().getSuppliesCents(),
      withdrawsCents: get().getWithdrawsCents(),
      expectedDrawerCents: expected,
      countedCents,
      differenceCents: diff,
    };

    set({
      currentSession: null,
      movements: [],
      lastClosingSummary: summary,
    });

    try {
      await closeCashSessionDb(summary);
    } catch (err) {
      console.error('Erro ao fechar caixa no SQLite:', err);
    }

    return summary;
  },

  clearLastSummary: () => set({ lastClosingSummary: null }),
}));