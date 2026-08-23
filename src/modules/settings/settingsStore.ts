import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StoreSettings, BackupRecord } from './types';
import { resetDatabaseDb, exportFullDatabaseDumpDb, restoreFullDatabaseDumpDb, FullDatabaseDump } from '../../core/database/db';
import { sendBackupByEmail, EmailBackupResult } from '../../core/backup/emailBackupService';
import { useProductStore } from '../products/productStore';
import { useCashStore } from '../cash/cashStore';
import { useCustomerStore } from '../customers/customerStore';

interface SettingsState {
  settings: StoreSettings;
  backups: BackupRecord[];
  isRestoring: boolean;
  lastBackupDate: string;
  updateSettings: (newSettings: Partial<StoreSettings>) => void;
  createBackup: (type?: 'AUTOMATIC' | 'MANUAL') => Promise<BackupRecord>;
  downloadBackup: (backup: BackupRecord) => void;
  restoreBackup: (backupId: string) => Promise<boolean>;
  importBackupFromFile: (jsonString: string, filename?: string) => Promise<boolean>;
  importBackup: () => Promise<void>;
  sendBackupEmail: (toEmailOverride?: string) => Promise<EmailBackupResult>;
  checkMonthlyAutoBackup: () => Promise<void>;
  resetAllData: () => Promise<void>;
}

const defaultSettings: StoreSettings = {
  companyName: 'Mercearia Uber',
  tradeName: 'Mercearia Uber',
  cnpj: '12.345.678/0001-90',
  stateRegistration: '123.456.789.000',
  phone: '(11) 98765-4321',
  address: 'Rua do Comércio, 123 - Centro',
  receiptFooterMessage: 'Obrigado pela preferência! Volte sempre.',
  printerName: '',
  printerWidthMm: 80,
  scalePort: 'COM3',
  scaleBaudRate: 9600,
  autoBackupDaily: true,
  autoBackupMonthly: true,
  backupEmail: '',
  resendApiKey: '',
};

function triggerBrowserDownload(filename: string, content: string) {
  try {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Erro ao disparar download do backup:', err);
  }
}

function calculateSimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      backups: [],
      isRestoring: false,
      lastBackupDate: new Date().toLocaleDateString('pt-BR'),

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      createBackup: async (type = 'MANUAL') => {
        try {
          const dump = await exportFullDatabaseDumpDb();
          const jsonString = JSON.stringify(dump, null, 2);
          const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const filename = `backup_mercearia_uber_${dateStr}.json`;
          const sizeBytes = new Blob([jsonString]).size;
          const checksum = `sha256-${calculateSimpleHash(jsonString)}`;
          const nowStr = new Date().toLocaleString('pt-BR');

          const newBackup: BackupRecord = {
            id: `bkp-${Date.now()}`,
            filename,
            createdAt: nowStr,
            sizeBytes,
            type,
            checksum,
            status: 'VALID',
            recordsCount: {
              products: dump.recordsCount.products,
              sales: dump.recordsCount.sales,
              cashMovements: dump.recordsCount.cashMovements,
              customers: dump.recordsCount.customers,
            },
            dumpData: jsonString,
          };

          triggerBrowserDownload(filename, jsonString);

          set((state) => ({
            backups: [newBackup, ...state.backups.slice(0, 19)], // guarda até 20 snapshots
            lastBackupDate: nowStr,
          }));

          return newBackup;
        } catch (err) {
          console.error('Erro ao gerar backup físico do SQLite:', err);
          throw err;
        }
      },

      downloadBackup: (backup: BackupRecord) => {
        if (!backup.dumpData) {
          alert('Dados de snapshot não encontrados para este item.');
          return;
        }
        triggerBrowserDownload(backup.filename, backup.dumpData);
      },

      restoreBackup: async (backupId: string) => {
        const backup = get().backups.find((b) => b.id === backupId);
        if (!backup || !backup.dumpData) {
          throw new Error('Arquivo de backup não encontrado na memória.');
        }

        set({ isRestoring: true });
        try {
          const dump: FullDatabaseDump = JSON.parse(backup.dumpData);
          await restoreFullDatabaseDumpDb(dump);

          // Recarrega todos os módulos
          await Promise.all([
            useProductStore.getState().loadFromDb().catch(() => {}),
            useCashStore.getState().initCash().catch(() => {}),
            useCustomerStore.getState().loadFromDb().catch(() => {}),
          ]);

          set({ isRestoring: false });
          return true;
        } catch (err) {
          set({ isRestoring: false });
          console.error('Erro ao restaurar backup:', err);
          throw err;
        }
      },

      importBackupFromFile: async (jsonString: string, originalFilename?: string) => {
        set({ isRestoring: true });
        try {
          const dump: FullDatabaseDump = JSON.parse(jsonString);
          await restoreFullDatabaseDumpDb(dump);

          const filename = originalFilename || `backup_importado_${Date.now()}.json`;
          const sizeBytes = new Blob([jsonString]).size;
          const checksum = `sha256-${calculateSimpleHash(jsonString)}`;
          const nowStr = new Date().toLocaleString('pt-BR');

          const importedRecord: BackupRecord = {
            id: `bkp-imp-${Date.now()}`,
            filename,
            createdAt: nowStr,
            sizeBytes,
            type: 'MANUAL',
            checksum,
            status: 'VALID',
            recordsCount: {
              products: dump.recordsCount?.products || 0,
              sales: dump.recordsCount?.sales || 0,
              cashMovements: dump.recordsCount?.cashMovements || 0,
              customers: dump.recordsCount?.customers || 0,
            },
            dumpData: jsonString,
          };

          // Recarrega todos os módulos
          await Promise.all([
            useProductStore.getState().loadFromDb().catch(() => {}),
            useCashStore.getState().initCash().catch(() => {}),
            useCustomerStore.getState().loadFromDb().catch(() => {}),
          ]);

          set((state) => ({
            backups: [importedRecord, ...state.backups.slice(0, 19)],
            lastBackupDate: nowStr,
            isRestoring: false,
          }));

          return true;
        } catch (err) {
          set({ isRestoring: false });
          console.error('Erro ao importar backup do arquivo:', err);
          throw err;
        }
      },

      importBackup: async () => {
        // Fallback genérico
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.db.json';
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = async (evt) => {
              const text = evt.target?.result as string;
              if (text) {
                await get().importBackupFromFile(text, file.name);
                alert('Backup restaurado e importado com sucesso!');
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
      },

      sendBackupEmail: async (toEmailOverride?: string) => {
        const { settings } = get();
        const targetEmail = toEmailOverride || settings.backupEmail;

        if (!targetEmail || !targetEmail.includes('@')) {
          return {
            success: false,
            message: 'Cadastre um e-mail válido nas configurações para enviar o backup.'
          };
        }

        try {
          const dump = await exportFullDatabaseDumpDb();
          const companyName = settings.tradeName || settings.companyName || 'Mercearia Uber';
          return await sendBackupByEmail(targetEmail, companyName, dump, settings.resendApiKey);
        } catch (err: any) {
          console.error('Erro ao preparar envio de backup por e-mail:', err);
          return {
            success: false,
            message: `Erro ao gerar dump para e-mail: ${err.message || err}`
          };
        }
      },

      checkMonthlyAutoBackup: async () => {
        const { settings } = get();
        if (settings.autoBackupMonthly === false) return;

        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const lastMonth = localStorage.getItem('mercado_pos_last_monthly_backup');

        if (lastMonth !== currentMonth) {
          try {
            await get().createBackup('AUTOMATIC');
            localStorage.setItem('mercado_pos_last_monthly_backup', currentMonth);

            // Dispara por e-mail silenciosamente se houver e-mail configurado
            if (settings.backupEmail && settings.backupEmail.includes('@')) {
              get().sendBackupEmail().catch((e) => console.warn('Erro envio e-mail mensal:', e));
            }
          } catch (err) {
            console.warn('Erro no backup automático mensal:', err);
          }
        }
      },

      // ZERA BANCO COM CÓPIA DE SEGURANÇA DE EMERGÊNCIA
      resetAllData: async () => {
        try {
          // 1. Gera backup emergencial pré-wipe
          try {
            const emergencyDump = await exportFullDatabaseDumpDb();
            const json = JSON.stringify(emergencyDump, null, 2);
            triggerBrowserDownload(`backup_emergencia_pre_reset_${Date.now()}.json`, json);
          } catch (_) {}

          await resetDatabaseDb();
          localStorage.removeItem('mercado_pos_active_session_data');

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
    }),
    {
      name: 'mercado_pos_settings_storage',
      partialize: (state) => ({
        settings: state.settings,
        backups: state.backups,
        lastBackupDate: state.lastBackupDate,
      }),
    }
  )
);