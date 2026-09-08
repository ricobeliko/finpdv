import React, { useState } from 'react';
import { X, User, Phone, MapPin, FileText } from 'lucide-react';
import { Customer } from '../types';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customerData: Omit<Customer, 'id' | 'totalSpentCents' | 'purchasesCount' | 'createdAt'>) => void;
  initialData?: Customer | null;
}

export function CustomerFormModal({ isOpen, onClose, onSave, initialData }: CustomerFormModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onClose,
    autoFocus: true,
  });

  if (!isOpen) return null;

  const [name, setName] = useState(initialData?.name || '');
  const [document, setDocument] = useState(initialData?.document || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [address, setAddress] = useState(initialData?.address || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('O nome do cliente é obrigatório.');
      return;
    }

    onSave({
      name: name.trim(),
      document: document.trim(),
      phone: phone.trim(),
      address: address.trim(),
      notes: notes.trim(),
      isActive
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div ref={trapRef} role="dialog" aria-modal="true" className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-textMain text-base flex items-center space-x-2">
            <User className="w-5 h-5 text-primary" />
            <span>{initialData ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}</span>
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Nome Completo / Razão Social *</label>
              <input
                type="text"
                required
                autoFocus
                placeholder="Ex: João da Silva Sauro"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">CPF ou CNPJ</label>
              <input
                type="text"
                placeholder="000.000.000-00"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Telefone / Celular</label>
              <input
                type="text"
                placeholder="(53) 98888-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Endereço Completo</label>
            <input
              type="text"
              placeholder="Rua, Número, Bairro, Cidade"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Observações Internas</label>
            <textarea
              rows={2}
              placeholder="Ex: Cliente prefere contato via WhatsApp / Autorizado compras por dependente"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="custActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded text-primary focus:ring-primary w-4 h-4"
            />
            <label htmlFor="custActive" className="text-xs font-medium text-textMain cursor-pointer">
              Cliente com cadastro ativo
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-lg text-xs font-bold shadow-sm"
            >
              {initialData ? 'Salvar Alterações' : 'Cadastrar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}