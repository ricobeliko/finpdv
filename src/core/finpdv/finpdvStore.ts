import { create } from 'zustand';
import { BusinessProfile, InstallationInfo, Store, Terminal, FinPdvUser } from './types';
import { 
  getInstallationInfoDb, 
  getBusinessProfileDb, 
  getStoresDb, 
  getTerminalsDb, 
  saveInstallationInfoDb, 
  saveBusinessProfileDb, 
  saveStoreDb, 
  saveTerminalDb,
  getUsersCountDb
} from '../database/finpdvDb';
import { authService } from '../auth/authService';

interface FinPdvState {
  installationInfo: InstallationInfo | null;
  businessProfile: BusinessProfile | null;
  stores: Store[];
  terminals: Terminal[];
  currentTerminal: Terminal | null;
  isConfigured: boolean;
  isLoading: boolean;
  currentUser: FinPdvUser | null;
  
  loadFinPdvData: () => Promise<void>;
  completeInitialSetup: (data: {
    business: {
      tradeName: string;
      legalName: string;
      cnpj?: string;
      phone?: string;
      email?: string;
      address?: string;
    };
    store: {
      name: string;
      code: string;
      address?: string;
    };
    terminal: {
      name: string;
      code: string;
      printerName?: string;
    };
    adminUser: {
      username: string;
      fullName: string;
      passwordPlain: string;
      pinPlain?: string;
    };
  }) => Promise<void>;
  setCurrentUser: (user: FinPdvUser | null) => void;
}

export const useFinPdvStore = create<FinPdvState>((set, get) => ({
  installationInfo: null,
  businessProfile: null,
  stores: [],
  terminals: [],
  currentTerminal: null,
  isConfigured: true, // Default true até carregar para evitar flicker
  isLoading: true,
  currentUser: null,

  setCurrentUser: (user) => {
    authService.setCurrentUser(user);
    set({ currentUser: user });
  },

  loadFinPdvData: async () => {
    try {
      set({ isLoading: true });
      const installInfo = await getInstallationInfoDb();
      const userCount = await getUsersCountDb();

      if (!installInfo || !installInfo.isConfigured || userCount === 0) {
        set({
          installationInfo: installInfo,
          isConfigured: false,
          isLoading: false
        });
        return;
      }

      const business = await getBusinessProfileDb();
      const stores = await getStoresDb();
      const terminals = await getTerminalsDb();
      const currentTerminal = terminals.length > 0 ? terminals[0] : null;

      set({
        installationInfo: installInfo,
        businessProfile: business,
        stores,
        terminals,
        currentTerminal,
        isConfigured: true,
        isLoading: false
      });
    } catch (err) {
      console.error('Erro ao carregar dados do FinPDV:', err);
      set({ isLoading: false });
    }
  },

  completeInitialSetup: async (data) => {
    const now = new Date().toISOString();
    
    // 1. Criar perfil de negócio
    const businessId = 'biz_' + Date.now().toString(36);
    const business: BusinessProfile = {
      id: businessId,
      tradeName: data.business.tradeName.trim(),
      legalName: data.business.legalName.trim(),
      cnpj: data.business.cnpj?.trim(),
      phone: data.business.phone?.trim(),
      email: data.business.email?.trim(),
      address: data.business.address?.trim(),
      createdAt: now,
      updatedAt: now
    };
    await saveBusinessProfileDb(business);

    // 2. Criar loja padrão
    const storeId = 'str_' + Date.now().toString(36);
    const store: Store = {
      id: storeId,
      businessId,
      name: data.store.name.trim(),
      code: data.store.code.trim(),
      address: data.store.address?.trim(),
      createdAt: now
    };
    await saveStoreDb(store);

    // 3. Criar terminal padrão
    const terminalId = 'trm_' + Date.now().toString(36);
    const terminal: Terminal = {
      id: terminalId,
      storeId,
      name: data.terminal.name.trim(),
      code: data.terminal.code.trim(),
      printerName: data.terminal.printerName?.trim(),
      createdAt: now
    };
    await saveTerminalDb(terminal);

    // 4. Criar primeiro administrador (CLIENT_ADMIN) com senha segura
    const adminUser = await authService.createUser({
      username: data.adminUser.username,
      fullName: data.adminUser.fullName,
      role: 'CLIENT_ADMIN',
      passwordPlain: data.adminUser.passwordPlain,
      pinPlain: data.adminUser.pinPlain
    }, true);

    // 5. Salvar info de instalação
    const installInfo: InstallationInfo = {
      installationId: 'inst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8),
      version: '0.2.3',
      appVersion: '0.2.3',
      isConfigured: true,
      configuredAt: now,
      environment: 'production'
    };
    await saveInstallationInfoDb(installInfo);

    // Logar automaticamente o admin inicial
    authService.setCurrentUser(adminUser);

    set({
      installationInfo: installInfo,
      businessProfile: business,
      stores: [store],
      terminals: [terminal],
      currentTerminal: terminal,
      isConfigured: true,
      currentUser: adminUser,
      isLoading: false
    });
  }
}));
