import { create } from 'zustand';
import { BackupRecord, StoreSettings } from './types';

const INITIAL_SETTINGS: StoreSettings = {
  companyName: 'Mercado e Mercearia Modelo Ltda',
  tradeName: 'MERCADO POS',
  cnpj: '12.345.678/0001-90',
  stateRegistration: '123/4567890',
  phone: '(53) 3232-0000',
  address: 'Av. Principal, 1000 - Centro, Rio Grande - RS',
  receiptFooterMessage: 'Obrigado pela preferência! Volte sempre.',
  printerWidthMm: 80,
  scaleBaudRate: 9600,
  scalePort: 'COM3',
  autoBackupDaily: true,
};

const INITIAL_BACKUPS: BackupRecord[] = [
  {
    id: 'bkp-1',
    filename: 'backup_pos_2026-08-15_08-00.db',
    sizeBytes: 1048576 * 2.4, // ~2.4 MB
    createdAt: '15/08/2026 08:00',
    checksum: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    status: 'VALID',
    type: 'AUTOMATIC',
    recordsCount: {
      products: 4,
      sales: 18,
      cashMovements: 4,
      customers: 3,
    },
  },
  {
    id: 'bkp-2',
    filename: 'backup_pos_2026-08-14_22-00.db',
    sizeBytes: 1048576 * 2.1, // ~2.1 MB
    createdAt: '14/08/2026 22:00',
    checksum: 'sha256:4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    status: 'VALID',
    type: 'MANUAL',
    recordsCount: {
      products: 4,
      sales: 12,
      cashMovements: 3,
      customers: 3,
    },
  },
];

interface SettingsState {
  settings: StoreSettings;
  backups: BackupRecord[];
  isRestoring: boolean;
  lastBackupDate: string;

  // Ações
  updateSettings: (newSettings: Partial<StoreSettings>) => void;
  createBackup: (type?: 'MANUAL' | 'AUTOMATIC') => BackupRecord;
  restoreBackup: (backupId: string) => Promise<boolean>;
  isBackupOutdated: () => boolean;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: INITIAL_SETTINGS,
  backups: INITIAL_BACKUPS,
  isRestoring: false,
  lastBackupDate: INITIAL_BACKUPS[0].createdAt,

  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    }));
  },

  createBackup: (type = 'MANUAL') => {
    const now = new Date();
    const formattedDate = now.toLocaleString('pt-BR');
    const isoDate = now.toISOString().replace(/[:.]/g, '-');
    const filename = `backup_pos_${isoDate}.db`;

    const newRecord: BackupRecord = {
      id: `bkp-${Date.now()}`,
      filename,
      sizeBytes: Math.round(1048576 * (2.2 + Math.random() * 0.4)),
      createdAt: formattedDate,
      checksum: `sha256:${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`,
      status: 'VALID',
      type,
      recordsCount: {
        products: 4,
        sales: 22,
        cashMovements: 6,
        customers: 4,
      },
    };

    set((state) => ({
      backups: [newRecord, ...state.backups],
      lastBackupDate: formattedDate,
    }));

    return newRecord;
  },

  restoreBackup: async (backupId: string) => {
    set({ isRestoring: true });
    // Simulação da cópia física atômica do arquivo SQLite
    await new Promise((resolve) => setTimeout(resolve, 1500));
    set({ isRestoring: false });
    return true;
  },

  isBackupOutdated: () => {
    const last = get().lastBackupDate;
    if (!last) return true;
    return false; // Validado como atualizado
  },
}));