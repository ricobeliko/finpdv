import React, { useState } from 'react';
import { X, Tags } from 'lucide-react';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}

export function CategoryModal({ isOpen, onClose, onSave }: CategoryModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onClose,
    autoFocus: true,
  });

  if (!isOpen) return null;
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div ref={trapRef} role="dialog" aria-modal="true" className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-textMain text-base flex items-center space-x-2">
            <Tags className="w-5 h-5 text-primary" />
            <span>Nova Categoria</span>
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Nome do Departamento *</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Ex: Padaria & Confeitaria"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-lg text-xs font-bold"
            >
              Salvar Categoria
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}