import { invoke } from '@tauri-apps/api/core';
import { FinPdvUser, PermissionCode, ROLE_PERMISSIONS, RoleType } from '../finpdv/types';
import { getUserByUsernameDb, getUserByIdDb, updateUserLastLoginDb, insertAuditLogDb, createUserDb } from '../database/finpdvDb';

// Sessão em memória do operador atual
let currentSessionUser: FinPdvUser | null = null;

export const authService = {
  getCurrentUser(): FinPdvUser | null {
    return currentSessionUser;
  },

  setCurrentUser(user: FinPdvUser | null) {
    currentSessionUser = user;
  },

  hasPermission(permission: PermissionCode): boolean {
    if (!currentSessionUser) return false;
    const allowed = ROLE_PERMISSIONS[currentSessionUser.role] || [];
    return allowed.includes(permission);
  },

  checkPermissionOrThrow(permission: PermissionCode, actionDescription?: string) {
    if (!this.hasPermission(permission)) {
      const desc = actionDescription ? `: ${actionDescription}` : '';
      throw new Error(`Acesso negado. O papel ${currentSessionUser?.role || 'ANÔNIMO'} não possui a permissão '${permission}'${desc}.`);
    }
  },

  async hashPassword(plain: string): Promise<string> {
    if (!plain || plain.trim().length < 4) {
      throw new Error('A credencial deve possuir pelo menos 4 caracteres.');
    }
    return await invoke<string>('hash_credential', { password: plain });
  },

  async verifyCredential(plain: string, hash: string): Promise<boolean> {
    if (!plain || !hash) return false;
    return await invoke<boolean>('verify_credential', {
      password: plain,
      passwordHash: hash
    });
  },

  async login(username: string, credentialPlain: string): Promise<FinPdvUser> {
    const trimmedUsername = username.trim().toLowerCase();
    const user = await getUserByUsernameDb(trimmedUsername);

    if (!user) {
      await insertAuditLogDb({
        userId: 'ANONYMOUS',
        role: 'OPERATOR',
        action: 'auth.login_failed',
        entity: 'user',
        details: JSON.stringify({ reason: 'Usuário não encontrado', username: trimmedUsername })
      });
      throw new Error('Credenciais inválidas.');
    }

    if (!user.isActive) {
      await insertAuditLogDb({
        userId: user.id,
        role: user.role,
        action: 'auth.login_failed',
        entity: 'user',
        entityId: user.id,
        details: JSON.stringify({ reason: 'Usuário inativo', username: trimmedUsername })
      });
      throw new Error('Usuário inativo. Contate o administrador.');
    }

    const isValid = await this.verifyCredential(credentialPlain, user.passwordHash);
    if (!isValid) {
      await insertAuditLogDb({
        userId: user.id,
        role: user.role,
        action: 'auth.login_failed',
        entity: 'user',
        entityId: user.id,
        details: JSON.stringify({ reason: 'Senha incorreta', username: trimmedUsername })
      });
      throw new Error('Credenciais inválidas.');
    }

    // Login com sucesso
    await updateUserLastLoginDb(user.id);
    currentSessionUser = user;

    await insertAuditLogDb({
      userId: user.id,
      role: user.role,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      details: JSON.stringify({ username: user.username, role: user.role })
    });

    return user;
  },

  async logout(): Promise<void> {
    if (currentSessionUser) {
      await insertAuditLogDb({
        userId: currentSessionUser.id,
        role: currentSessionUser.role,
        action: 'auth.logout',
        entity: 'user',
        entityId: currentSessionUser.id,
        details: JSON.stringify({ username: currentSessionUser.username })
      });
    }
    currentSessionUser = null;
  },

  async createUser(data: {
    username: string;
    fullName: string;
    role: RoleType;
    passwordPlain: string;
    pinPlain?: string;
  }, isInitialSetup: boolean = false): Promise<FinPdvUser> {
    if (!isInitialSetup) {
      this.checkPermissionOrThrow('users.manage', 'Criar novo usuário');
    }

    const trimmedUsername = data.username.trim().toLowerCase();
    const existing = await getUserByUsernameDb(trimmedUsername);
    if (existing) {
      throw new Error(`O usuário '${trimmedUsername}' já existe.`);
    }

    const passwordHash = await this.hashPassword(data.passwordPlain);
    let pinHash: string | undefined = undefined;
    if (data.pinPlain && data.pinPlain.trim()) {
      pinHash = await this.hashPassword(data.pinPlain.trim());
    }

    const newUser: FinPdvUser = {
      id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      username: trimmedUsername,
      fullName: data.fullName.trim(),
      role: data.role,
      passwordHash,
      pinHash,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    await createUserDb(newUser);

    await insertAuditLogDb({
      userId: currentSessionUser?.id || 'SETUP_WIZARD',
      role: currentSessionUser?.role || 'CLIENT_ADMIN',
      action: 'user.created',
      entity: 'user',
      entityId: newUser.id,
      details: JSON.stringify({ username: newUser.username, role: newUser.role, fullName: newUser.fullName })
    });

    return newUser;
  }
};
