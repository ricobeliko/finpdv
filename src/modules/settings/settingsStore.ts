import { create } from 'zustand';
import { StoreSettings, BackupRecord } from './types';
import { resetDatabaseDb } from '../../core/database/db';
import { useProductStore } from '../products/productStore';
import { useCashStore } from '../cash/cashStore';
import { useCustomerStore } from '../customers/customerStore';

interface SettingsState {
  settings: StoreSettings;
  backups: BackupRecord[];
  isRestoring: boolean;
  lastBackupDate: string;
  updateSettings: (newSettings: Partial<StoreSettings>) => void;
  createBackup: (type?: 'AUTOMATIC' | 'MANUAL') => BackupRecord;
  restoreBackup: (backupId: string) => Promise<boolean>;
  importBackup: () => Promise<void>;
  resetAllData: () => Promise<void>;
}

const defaultSettings: StoreSettings = {
  companyName: 'Mercado & Mercearia Modelo LTDA',
  tradeName: 'Mercado Modelo',
  cnpj: '12.345.678/0001-90',
  phone: '(11) 98765-4321',
  address: 'Rua do Comércio, 123 - Centro',
  receiptFooterMessage: 'Obrigado pela preferência! Volte sempre.',
  printerName: '',
  printerWidthMm: 80,
  scalePort: 'COM3',
  scaleBaudRate: 9600,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  backups: [],
  isRestoring: false,
  lastBackupDate: new Date().toLocaleDateString('pt-BR'),

  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    }));
  },

  createBackup: (type = 'MANUAL') => {
    const newBackup: BackupRecord = {
      id: `bkp-${Date.now()}`,
      filename: `backup_mercado_${new Date().toISOString().replace(/[:.]/g, '-')}.db`,
      createdAt: new Date().toLocaleString('pt-BR'),
      sizeBytes: 1024 * 150,
      type,
      checksum: `sha256-${Math.random().toString(36).substring(2, 10)}`,
    };

    set((state) => ({
      backups: [newBackup, ...state.backups],
      lastBackupDate: newBackup.createdAt,
    }));

    return newBackup;
  },

  restoreBackup: async (_backupId: string) => {
    set({ isRestoring: true });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    set({ isRestoring: false });
    return true;
  },

  importBackup: async () => {
    const imported: BackupRecord = {
      id: `bkp-imp-${Date.now()}`,
      filename: `imported_backup_${Date.now()}.db`,
      createdAt: new Date().toLocaleString('pt-BR'),
      sizeBytes: 1024 * 200,
      type: 'MANUAL',
      checksum: `sha256-imported-${Math.random().toString(36).substring(2, 8)}`,
    };
    set((state) => ({
      backups: [imported, ...state.backups],
    }));
  },

  // ZERA BANCO SQLITE, MEMÓRIA E LOCALSTORAGE
  resetAllData: async () => {
    try {
      await resetDatabaseDb();
      localStorage.clear();

      useProductStore.setState({ products: [], movements: [] });
      useCashStore.setState({ currentSession: null, sessions: [], movements: [] });
      useCustomerStore.setState({ customers: [] });

      set({
        backups: [],
        lastBackupDate: 'Nenhum backup realizado',
      });
    } catch (err) {
      console.error('Erro ao zerar banco de dados:', err);
    }
  },
}));