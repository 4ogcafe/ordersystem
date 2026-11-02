import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ChevronDown, ChevronRight, ChevronUp, Edit2, FileSpreadsheet, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { apiFetch, assetUrl, errorMessage } from '../../lib/api';
import { getCategoryIcon } from '../../lib/category-icons';
import MenuImportModal from './MenuImportModal';
import type { TabIntent } from './TopBar';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Category { id: string; nameEn: string; nameJa: string | null; parentId: string | null; sortOrder: number; }
interface OptionGroupStub { id: string; nameJa: string; nameEn: string; type: string; }
interface MenuItem {
  id: string; categoryId: string; nameEn: string; nameJa: string | null;
  descriptionEn: string | null; descriptionJa: string | null;
  price: number; imageUrl: string | null; rating: number | null; spiceLevel: number;
  isRecommended: boolean; isVegetarian: boolean; isVegan: boolean; isHalal: boolean;
  isGlutenFree: boolean; isSoldOut: boolean; isOrderable?: boolean; isActive: boolean;
  menuTypes: string[]; allergens: string[]; sortOrder: number;
  optionGroups: OptionGroupStub[];
}
interface OptionGroup extends OptionGroupStub {
  required: boolean; options: { id: string; nameJa: string; nameEn: string; priceAdjust: number }[]; sortOrder: number;
}

const MENU_TYPES = ['LUNCH', 'TAKEOUT', 'GRAND'] as const;
export const FIXED_CATEGORY_NAMES = ['Lunch Menu', 'Takeout Menu', 'Grand Menu'];

export function isFixedCategory(cat?: { nameEn?: string; parentId?: string | null } | null): boolean {
  if (!cat || cat.parentId) return false;
  return FIXED_CATEGORY_NAMES.map(n => n.toLowerCase()).includes((cat.nameEn || '').trim().toLowerCase());
}

const ALLERGEN_LIST = ['小麦', 'そば', '卵', '乳', '落花生', 'えび', 'かに', '牛肉', '豚肉', '鶏肉', '魚介類', 'ごま', 'ナッツ', 'Gluten', 'Nuts', 'Dairy', 'Egg', 'Soy'];

function spiceIcon(level: number) {
  return Array.from({ length: 5 }).map((_, i) => (
    <span key={i} style={{ fontSize: '1rem', opacity: i < level ? 1 : 0.2 }}>🌶️</span>
  ));
}

// ─── Blank form ──────────────────────────────────────────────────────────────
const blankForm = (categoryId = '', cat?: Category | null) => {
  const initialTypes: string[] = [];
  if (cat) {
    const name = (cat.nameEn || '').toLowerCase();
    if (name.includes('lunch')) initialTypes.push('LUNCH');
    if (name.includes('takeout')) initialTypes.push('TAKEOUT');
    if (name.includes('grand')) initialTypes.push('GRAND');
  }
  return {
    id: '', categoryId, nameEn: '', nameJa: '', descriptionEn: '', descriptionJa: '',
    price: '', imageUrl: '', rating: '', spiceLevel: 0,
    isRecommended: false, isVegetarian: false, isVegan: false, isHalal: false, isGlutenFree: false,
    isSoldOut: false, isOrderable: true, isActive: true, menuTypes: initialTypes, allergens: [] as string[],
    optionGroupIds: [] as string[], newAllergen: '',
  };
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', boxSizing: 'border-box', background: '#f9fafb', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: '#374151' };
const badge = (bg: string, color: string): React.CSSProperties => ({ padding: '2px 8px', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700, background: bg, color });

// ─── Main component ───────────────────────────────────────────────────────────
export default function MenuManagementTab({ intent }: { intent: TabIntent | null }) {
  const [subTab, setSubTab] = useState<'items' | 'option-groups'>('items');

  // ── Data ──
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);

  // ── UI state ──
  const [orderingEnabled, setOrderingEnabled] = useState<boolean>(true);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState(blankForm());
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'all' | 'takeout' | 'dine_in' | 'lunch' | 'sold_out'>('all');
  const [importOpen, setImportOpen] = useState(false);

  // Drag & drop for sub-categories
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | null>(null);

  // Drag & drop for food items
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverItemPosition, setDragOverItemPosition] = useState<'before' | 'after' | null>(null);

  // Category add/edit
  const [catForm, setCatForm] = useState({ open: false, id: '', nameEn: '', nameJa: '', parentId: '' });
  const catInputRef = useRef<HTMLInputElement>(null);

  // Option group form
  const [ogForm, setOgForm] = useState({ id: '', nameJa: '', nameEn: '', type: 'RADIO', required: true, sortOrder: 0, options: [{ id: '', nameJa: '', nameEn: '', priceAdjust: 0 }] });
  const [ogSaving, setOgSaving] = useState(false);

  // ── Quick-Add intent ──
  useEffect(() => { if (intent?.action === 'add-item') openAdd(); }, [intent?.nonce]);

  // ── Fetch ──
  const fetchAll = async () => {
    const [catRes, itemRes, ogRes, settingsRes] = await Promise.all([
      apiFetch('/api/v1/menu/categories').then(r => r.json()),
      apiFetch('/api/v1/menu/items').then(r => r.json()),
      apiFetch('/api/v1/menu/option-groups').then(r => r.json()),
      apiFetch('/api/v1/settings').then(r => r.json()).catch(() => ({})),
    ]);
    if (Array.isArray(catRes)) setCategories(catRes);
    if (Array.isArray(itemRes)) setItems(itemRes);
    if (Array.isArray(ogRes)) setOptionGroups(ogRes);
    if (settingsRes && typeof settingsRes.orderingEnabled === 'boolean') {
      setOrderingEnabled(settingsRes.orderingEnabled);
    }
  };
  useEffect(() => { fetchAll(); }, []);

  const toggleMasterOrdering = async () => {
    const next = !orderingEnabled;
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderingEnabled: next }),
      });
      if (res.ok) {
        setOrderingEnabled(next);
        toast.success(
          next
            ? '全体注文受付を ON にしました。（フードカードに注文ボタンが表示されます）'
            : '全体注文受付を OFF にしました。（フードカードの注文ボタンが非表示になります）'
        );
      } else {
        toast.error('設定の更新に失敗しました。');
      }
    } catch {
      toast.error('通信エラーが発生しました。');
    }
  };

  // ── Select first category automatically ──
  useEffect(() => {
    if (!selectedCatId && categories.length > 0) setSelectedCatId(categories[0].id);
  }, [categories]);

  // ── Item form helpers ──
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const openAdd = () => {
    const curCat = categories.find(c => c.id === (selectedCatId ?? categories[0]?.id));
    setForm(blankForm(selectedCatId ?? categories[0]?.id ?? '', curCat));
    setIsEditing(true);
  };

  const openEdit = (item: MenuItem) => {
    setForm({
      id: item.id, categoryId: item.categoryId,
      nameEn: item.nameEn, nameJa: item.nameJa ?? '',
      descriptionEn: item.descriptionEn ?? '', descriptionJa: item.descriptionJa ?? '',
      price: String(item.price), imageUrl: item.imageUrl ?? '', rating: String(item.rating ?? ''),
      spiceLevel: item.spiceLevel,
      isRecommended: item.isRecommended, isVegetarian: item.isVegetarian,
      isVegan: item.isVegan, isHalal: item.isHalal, isGlutenFree: item.isGlutenFree,
      isSoldOut: item.isSoldOut, isOrderable: item.isOrderable !== false, isActive: item.isActive,
      menuTypes: [...item.menuTypes], allergens: [...item.allergens],
      optionGroupIds: item.optionGroups.map(g => g.id), newAllergen: '',
    });
    setIsEditing(true);
  };

  const closeForm = () => { setIsEditing(false); setForm(blankForm(selectedCatId ?? '')); };

  // ── Image upload ──
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append('image', file);
    try {
      const res = await apiFetch('/api/v1/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.imageUrl) set({ imageUrl: data.imageUrl });
      else toast.error('Upload failed.');
    } catch { toast.error('Upload error.'); }
    finally { setUploading(false); }
  };

  // ── Save item ──
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId) { toast.error('Select a category.'); return; }
    setSaving(true);
    try {
      const body = {
        categoryId: form.categoryId, nameEn: form.nameEn, nameJa: form.nameJa || null,
        descriptionEn: form.descriptionEn || null, descriptionJa: form.descriptionJa || null,
        price: Number(form.price), imageUrl: form.imageUrl || null,
        rating: form.rating !== '' ? Number(form.rating) : null,
        spiceLevel: form.spiceLevel, menuTypes: form.menuTypes, allergens: form.allergens,
        isRecommended: form.isRecommended, isVegetarian: form.isVegetarian,
        isVegan: form.isVegan, isHalal: form.isHalal, isGlutenFree: form.isGlutenFree,
        isSoldOut: form.isSoldOut, isOrderable: form.isOrderable !== false, isActive: form.isActive,
        optionGroupIds: form.optionGroupIds,
      };
      const url = form.id ? `/api/v1/menu/items/${form.id}` : '/api/v1/menu/items';
      const method = form.id ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(form.id ? 'Item updated.' : 'Item added.');
        closeForm(); fetchAll();
      } else toast.error(await errorMessage(res, 'Failed to save.'));
    } catch { toast.error('Network error.'); }
    finally { setSaving(false); }
  };

  // ── Sold-out toggle ──
  const toggleSoldOut = async (item: MenuItem) => {
    const res = await apiFetch(`/api/v1/menu/items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isSoldOut: !item.isSoldOut }) });
    if (res.ok) { toast.success(item.isSoldOut ? 'Back in stock.' : 'Marked sold out.'); fetchAll(); }
    else toast.error('Failed.');
  };

  // ── Orderable toggle ──
  const toggleOrderable = async (item: MenuItem) => {
    const next = item.isOrderable === false;
    const res = await apiFetch(`/api/v1/menu/items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isOrderable: next }) });
    if (res.ok) {
      toast.success(next ? `“${item.nameJa || item.nameEn}” の注文ボタンを表示にしました。` : `“${item.nameJa || item.nameEn}” の注文ボタンを非表示にしました。`);
      fetchAll();
    } else toast.error('Failed to update.');
  };

  // ── Takeout toggle ──
  const toggleTakeout = async (item: MenuItem) => {
    const hasTakeout = item.menuTypes.includes('TAKEOUT');
    const nextMenuTypes = hasTakeout
      ? item.menuTypes.filter(t => t !== 'TAKEOUT')
      : [...item.menuTypes, 'TAKEOUT'];
    const res = await apiFetch(`/api/v1/menu/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuTypes: nextMenuTypes }),
    });
    if (res.ok) {
      toast.success(!hasTakeout ? `“${item.nameJa || item.nameEn}” をテイクアウト可能に設定しました` : `“${item.nameJa || item.nameEn}” をテイクアウト対象外に設定しました`);
      fetchAll();
    } else {
      toast.error('テイクアウト設定の更新に失敗しました');
    }
  };

  // ── Dine-In toggle ──
  const toggleDineIn = async (item: MenuItem) => {
    const hasDineIn = item.menuTypes.includes('GRAND') || item.menuTypes.includes('LUNCH');
    let nextMenuTypes: string[];
    if (hasDineIn) {
      nextMenuTypes = item.menuTypes.filter(t => t !== 'GRAND' && t !== 'LUNCH');
    } else {
      nextMenuTypes = [...item.menuTypes, 'GRAND'];
    }
    const res = await apiFetch(`/api/v1/menu/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuTypes: nextMenuTypes }),
    });
    if (res.ok) {
      toast.success(!hasDineIn ? `“${item.nameJa || item.nameEn}” を店内メニューに設定しました` : `“${item.nameJa || item.nameEn}” を店内メニュー対象外に設定しました`);
      fetchAll();
    } else {
      toast.error('店内メニュー設定の更新に失敗しました');
    }
  };

  // ── Active toggle ──
  const toggleActive = async (item: MenuItem) => {
    const res = await apiFetch(`/api/v1/menu/items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !item.isActive }) });
    if (res.ok) { toast.success(item.isActive ? 'Item hidden.' : 'Item visible.'); fetchAll(); }
    else toast.error('Failed.');
  };

  // ── Delete item ──
  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    const res = await apiFetch(`/api/v1/menu/items/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Deleted.'); fetchAll(); }
    else toast.error('Failed to delete.');
  };

  // ── Category CRUD ──
  const openCatAdd = (defaultParentId = '') => {
    setCatForm({ open: true, id: '', nameEn: '', nameJa: '', parentId: defaultParentId || (selectedCatId ?? '') });
    setTimeout(() => catInputRef.current?.focus(), 50);
  };
  const openCatEdit = (cat: Category) => {
    setCatForm({ open: true, id: cat.id, nameEn: cat.nameEn, nameJa: cat.nameJa ?? '', parentId: cat.parentId ?? '' });
    setTimeout(() => catInputRef.current?.focus(), 50);
  };
  const closeCatForm = () => setCatForm(f => ({ ...f, open: false }));

  const saveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catForm.nameEn.trim()) return;
    const isFixed = isFixedCategory(categories.find(c => c.id === catForm.id));
    const body: Record<string, unknown> = { nameEn: catForm.nameEn, nameJa: catForm.nameJa || catForm.nameEn };
    if (!isFixed && catForm.parentId) body.parentId = catForm.parentId;
    const url = catForm.id ? `/api/v1/menu/categories/${catForm.id}` : '/api/v1/menu/categories';
    const method = catForm.id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      toast.success(catForm.id ? 'Category updated.' : 'Category added.');
      closeCatForm(); fetchAll();
      if (!catForm.id) { const d = await res.json(); setSelectedCatId(d.id); }
    } else toast.error(await errorMessage(res, 'Failed.'));
  };

  const deleteCat = async (cat: Category) => {
    if (isFixedCategory(cat)) {
      toast.error('Main categories (Lunch Menu, Takeout Menu, Grand Menu) cannot be deleted.');
      return;
    }
    if (!confirm(`Delete category "${cat.nameEn}" and ALL its items and subcategories?`)) return;
    const res = await apiFetch(`/api/v1/menu/categories/${cat.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Category deleted.'); setSelectedCatId(null); fetchAll(); }
    else toast.error(await errorMessage(res, 'Failed.'));
  };

  // ── Option group CRUD ──
  const ogReset = () => setOgForm({ id: '', nameJa: '', nameEn: '', type: 'RADIO', required: true, sortOrder: 0, options: [{ id: '', nameJa: '', nameEn: '', priceAdjust: 0 }] });
  const ogEdit = (g: OptionGroup) => setOgForm({ id: g.id, nameJa: g.nameJa, nameEn: g.nameEn, type: g.type, required: g.required, sortOrder: g.sortOrder, options: g.options.map(o => ({ ...o })) });
  const ogAddChoice = () => setOgForm(f => ({ ...f, options: [...f.options, { id: '', nameJa: '', nameEn: '', priceAdjust: 0 }] }));
  const ogRemoveChoice = (i: number) => setOgForm(f => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }));
  const ogUpdateChoice = (i: number, k: string, v: unknown) => setOgForm(f => ({ ...f, options: f.options.map((o, idx) => idx === i ? { ...o, [k]: v } : o) }));

  const ogSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const opts = ogForm.options.filter(o => o.nameJa.trim() && o.id.trim());
    if (!opts.length) { toast.error('Add at least one choice.'); return; }
    setOgSaving(true);
    try {
      const url = ogForm.id ? `/api/v1/menu/option-groups/${ogForm.id}` : '/api/v1/menu/option-groups';
      const res = await apiFetch(url, { method: ogForm.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ogForm, options: opts }) });
      if (res.ok) { toast.success(ogForm.id ? 'Updated.' : 'Created.'); ogReset(); fetchAll(); }
      else toast.error(await errorMessage(res, 'Failed.'));
    } catch { toast.error('Network error.'); }
    finally { setOgSaving(false); }
  };

  const ogDelete = async (id: string) => {
    if (!confirm('Delete this option group?')) return;
    const res = await apiFetch(`/api/v1/menu/option-groups/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Deleted.'); fetchAll(); }
    else toast.error('Failed.');
  };

  // ── Derived ──
  const selectedCat = categories.find(c => c.id === selectedCatId) ?? null;
  // Names from the top-level category down to the selected one, used as the import default.
  const selectedPath: string[] = [];
  for (let c = selectedCat; c; c = c.parentId ? categories.find(p => p.id === c!.parentId) ?? null : null) {
    selectedPath.unshift(c.nameEn);
    if (selectedPath.length > 4) break;
  }
  const catItems = useMemo(() => {
    return items.filter(it => it.categoryId === selectedCatId);
  }, [items, selectedCatId]);

  const takeoutCount = useMemo(() => catItems.filter(it => it.menuTypes.includes('TAKEOUT')).length, [catItems]);
  const dineInCount = useMemo(() => catItems.filter(it => it.menuTypes.includes('GRAND') || it.menuTypes.includes('LUNCH')).length, [catItems]);
  const lunchCount = useMemo(() => catItems.filter(it => it.menuTypes.includes('LUNCH') || (it.nameJa ?? '').includes('ランチ') || it.nameEn.toLowerCase().includes('lunch')).length, [catItems]);
  const soldOutCount = useMemo(() => catItems.filter(it => it.isSoldOut).length, [catItems]);

  const filteredItems = useMemo(() => {
    return catItems
      .filter(it => {
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchEn = it.nameEn.toLowerCase().includes(q);
          const matchJa = (it.nameJa ?? '').toLowerCase().includes(q);
          if (!matchEn && !matchJa) return false;
        }
        if (fulfillmentFilter === 'takeout') {
          return it.menuTypes.includes('TAKEOUT');
        }
        if (fulfillmentFilter === 'dine_in') {
          return it.menuTypes.includes('GRAND') || it.menuTypes.includes('LUNCH');
        }
        if (fulfillmentFilter === 'lunch') {
          return it.menuTypes.includes('LUNCH') || (it.nameJa ?? '').includes('ランチ') || it.nameEn.toLowerCase().includes('lunch');
        }
        if (fulfillmentFilter === 'sold_out') {
          return it.isSoldOut;
        }
        return true;
      })
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [catItems, search, fulfillmentFilter]);

  // Category tree helpers
  const rootCats = categories.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  const childCats = (parentId: string) => categories.filter(c => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  // Helper: formatted label for category dropdowns
  const categoryLabel = (cat: Category): string => {
    const parent = cat.parentId ? categories.find(p => p.id === cat.parentId) : null;
    return parent ? `${parent.nameEn} › ${cat.nameEn}` : cat.nameEn;
  };

  const handleDragStart = (e: React.DragEvent, cat: Category) => {
    // Only allow dragging sub-categories (non-fixed categories with a parent)
    if (!cat.parentId || isFixedCategory(cat)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cat.id);
    setDraggedCatId(cat.id);
  };

  const handleDragOver = (e: React.DragEvent, targetCat: Category) => {
    if (!draggedCatId || draggedCatId === targetCat.id) return;
    const draggedCat = categories.find(c => c.id === draggedCatId);
    // Can only reorder siblings under the same parent
    if (!draggedCat || draggedCat.parentId !== targetCat.parentId) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'before' : 'after';
    if (dragOverCatId !== targetCat.id || dragOverPosition !== pos) {
      setDragOverCatId(targetCat.id);
      setDragOverPosition(pos);
    }
  };

  const handleDragLeave = (e: React.DragEvent, targetCat: Category) => {
    if (dragOverCatId === targetCat.id) {
      const rect = e.currentTarget.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX >= rect.right ||
        e.clientY < rect.top ||
        e.clientY >= rect.bottom
      ) {
        setDragOverCatId(null);
        setDragOverPosition(null);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent, targetCat: Category) => {
    e.preventDefault();
    if (!draggedCatId || draggedCatId === targetCat.id) {
      setDraggedCatId(null);
      setDragOverCatId(null);
      setDragOverPosition(null);
      return;
    }

    const draggedCat = categories.find(c => c.id === draggedCatId);
    if (!draggedCat || draggedCat.parentId !== targetCat.parentId || !targetCat.parentId) {
      setDraggedCatId(null);
      setDragOverCatId(null);
      setDragOverPosition(null);
      return;
    }

    // Get current sibling order
    const siblings = categories
      .filter(c => c.parentId === targetCat.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const oldIndex = siblings.findIndex(c => c.id === draggedCatId);
    const targetIndex = siblings.findIndex(c => c.id === targetCat.id);

    if (oldIndex === -1 || targetIndex === -1) {
      setDraggedCatId(null);
      setDragOverCatId(null);
      setDragOverPosition(null);
      return;
    }

    const newSiblings = [...siblings];
    const [removed] = newSiblings.splice(oldIndex, 1);
    let newIndex = newSiblings.findIndex(c => c.id === targetCat.id);
    if (dragOverPosition === 'after') {
      newIndex += 1;
    }
    newSiblings.splice(newIndex, 0, removed);

    // Optimistically update categories locally
    const orderUpdates = newSiblings.map((c, index) => ({ id: c.id, sortOrder: index + 1 }));
    setCategories(prev =>
      prev.map(c => {
        const update = orderUpdates.find(u => u.id === c.id);
        return update ? { ...c, sortOrder: update.sortOrder } : c;
      })
    );

    setDraggedCatId(null);
    setDragOverCatId(null);
    setDragOverPosition(null);

    // Sync to API
    try {
      const res = await apiFetch('/api/v1/menu/categories-reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: orderUpdates }),
      });
      if (res.ok) {
        toast.success('並び順を更新しました。');
      } else {
        toast.error('並び順の更新に失敗しました。');
        fetchAll();
      }
    } catch {
      toast.error('通信エラーが発生しました。');
      fetchAll();
    }
  };

  const handleDragEnd = () => {
    setDraggedCatId(null);
    setDragOverCatId(null);
    setDragOverPosition(null);
  };

  // ── Food item drag & drop and manual move ──
  const handleItemDragStart = (e: React.DragEvent, item: MenuItem) => {
    if (search.trim()) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
    setDraggedItemId(item.id);
  };

  const handleItemDragOver = (e: React.DragEvent, targetItem: MenuItem) => {
    if (!draggedItemId || draggedItemId === targetItem.id) return;
    const dragged = items.find(it => it.id === draggedItemId);
    if (!dragged || dragged.categoryId !== targetItem.categoryId) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'before' : 'after';
    if (dragOverItemId !== targetItem.id || dragOverItemPosition !== pos) {
      setDragOverItemId(targetItem.id);
      setDragOverItemPosition(pos);
    }
  };

  const handleItemDragLeave = (e: React.DragEvent, targetItem: MenuItem) => {
    if (dragOverItemId === targetItem.id) {
      const rect = e.currentTarget.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX >= rect.right ||
        e.clientY < rect.top ||
        e.clientY >= rect.bottom
      ) {
        setDragOverItemId(null);
        setDragOverItemPosition(null);
      }
    }
  };

  const handleItemDrop = async (e: React.DragEvent, targetItem: MenuItem) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetItem.id) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      setDragOverItemPosition(null);
      return;
    }

    const dragged = items.find(it => it.id === draggedItemId);
    if (!dragged || dragged.categoryId !== targetItem.categoryId) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      setDragOverItemPosition(null);
      return;
    }

    const catItems = items
      .filter(it => it.categoryId === targetItem.categoryId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const oldIndex = catItems.findIndex(it => it.id === draggedItemId);
    const targetIndex = catItems.findIndex(it => it.id === targetItem.id);

    if (oldIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      setDragOverItemPosition(null);
      return;
    }

    const newItems = [...catItems];
    const [removed] = newItems.splice(oldIndex, 1);
    let newIndex = newItems.findIndex(it => it.id === targetItem.id);
    if (dragOverItemPosition === 'after') {
      newIndex += 1;
    }
    newItems.splice(newIndex, 0, removed);

    // Optimistically update items locally
    const orderUpdates = newItems.map((it, index) => ({ id: it.id, sortOrder: index + 1 }));
    setItems(prev =>
      prev.map(it => {
        const update = orderUpdates.find(u => u.id === it.id);
        return update ? { ...it, sortOrder: update.sortOrder } : it;
      })
    );

    setDraggedItemId(null);
    setDragOverItemId(null);
    setDragOverItemPosition(null);

    try {
      const res = await apiFetch('/api/v1/menu/items-reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: orderUpdates }),
      });
      if (res.ok) {
        toast.success('料理の並び順を更新しました。');
      } else {
        toast.error('並び順の更新に失敗しました。');
        fetchAll();
      }
    } catch {
      toast.error('通信エラーが発生しました。');
      fetchAll();
    }
  };

  const handleItemDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
    setDragOverItemPosition(null);
  };

  const moveItem = async (item: MenuItem, direction: 'up' | 'down') => {
    const catItems = items
      .filter(it => it.categoryId === item.categoryId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const currentIndex = catItems.findIndex(it => it.id === item.id);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= catItems.length) return;

    const newItems = [...catItems];
    const temp = newItems[currentIndex];
    newItems[currentIndex] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    const orderUpdates = newItems.map((it, index) => ({ id: it.id, sortOrder: index + 1 }));
    setItems(prev =>
      prev.map(it => {
        const update = orderUpdates.find(u => u.id === it.id);
        return update ? { ...it, sortOrder: update.sortOrder } : it;
      })
    );

    try {
      const res = await apiFetch('/api/v1/menu/items-reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: orderUpdates }),
      });
      if (res.ok) {
        toast.success('料理の並び順を更新しました。');
      } else {
        toast.error('並び順の更新に失敗しました。');
        fetchAll();
      }
    } catch {
      toast.error('通信エラーが発生しました。');
      fetchAll();
    }
  };

  // ── Render category row ──
  const renderCatRow = (cat: Category, depth = 0) => {
    const children = childCats(cat.id).sort((a, b) => a.sortOrder - b.sortOrder);
    const isSelected = selectedCatId === cat.id;
    const itemCount = items.filter(it => it.categoryId === cat.id).length;
    const isFixed = isFixedCategory(cat);
    const isSubcategory = Boolean(cat.parentId) && !isFixed;
    const isDragging = draggedCatId === cat.id;
    const isDropTarget = dragOverCatId === cat.id;

    return (
      <div
        key={cat.id}
        style={{ position: 'relative' }}
        onDragOver={isSubcategory ? e => handleDragOver(e, cat) : undefined}
        onDragLeave={isSubcategory ? e => handleDragLeave(e, cat) : undefined}
        onDrop={isSubcategory ? e => handleDrop(e, cat) : undefined}
      >
        {/* Drop indicators */}
        {isDropTarget && dragOverPosition === 'before' && (
          <div style={{ position: 'absolute', top: -2, left: `${depth * 16 + 12}px`, right: 0, height: '3px', background: '#3b82f6', borderRadius: '2px', zIndex: 10 }} />
        )}
        {isDropTarget && dragOverPosition === 'after' && (
          <div style={{ position: 'absolute', bottom: -2, left: `${depth * 16 + 12}px`, right: 0, height: '3px', background: '#3b82f6', borderRadius: '2px', zIndex: 10 }} />
        )}

        <div
          draggable={isSubcategory}
          onDragStart={isSubcategory ? e => handleDragStart(e, cat) : undefined}
          onDragEnd={isSubcategory ? handleDragEnd : undefined}
          onClick={() => { setSelectedCatId(cat.id); setIsEditing(false); if (children.length) toggle(cat.id); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: `0.55rem 0.75rem 0.55rem ${depth * 16 + 12}px`,
            borderRadius: '8px',
            cursor: isSubcategory ? 'grab' : 'pointer',
            marginBottom: '2px',
            background: isSelected ? '#faebd7' : isDropTarget ? '#eff6ff' : 'transparent',
            color: isSelected ? '#8b4513' : '#374151',
            fontWeight: isSelected ? 700 : isFixed ? 600 : 500,
            fontSize: '0.9rem',
            opacity: isDragging ? 0.4 : 1,
            transition: 'background 0.15s, opacity 0.15s',
            border: isDropTarget ? '1px dashed #3b82f6' : '1px solid transparent',
          }}
          onMouseEnter={e => { if (!isSelected && !isDropTarget) e.currentTarget.style.background = '#f9fafb'; }}
          onMouseLeave={e => { if (!isSelected && !isDropTarget) e.currentTarget.style.background = 'transparent'; }}
        >
          {/* Drag handle for subcategories */}
          {isSubcategory ? (
            <span
              title="ドラッグして並び替え"
              style={{ display: 'flex', alignItems: 'center', color: '#9ca3af', cursor: 'grab', marginRight: -2 }}
              onClick={e => e.stopPropagation()}
            >
              <GripVertical size={14} />
            </span>
          ) : children.length > 0 ? (
            <span style={{ display: 'flex', color: '#9ca3af' }}>{expanded[cat.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          ) : (
            <span style={{ width: '14px' }} />
          )}

          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isSubcategory && <span style={{ marginRight: '6px' }}>{getCategoryIcon(cat.nameJa, cat.nameEn)}</span>}
            {cat.nameEn}
            {isFixed && (
              <span style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '1px 6px', background: '#e0e7ff', color: '#3730a3', borderRadius: '4px', fontWeight: 700 }}>
                Main
              </span>
            )}
          </span>
          {itemCount > 0 && <span style={{ fontSize: '0.7rem', color: '#9ca3af', marginLeft: 2 }}>{itemCount}</span>}
          {isSelected && (
            <span style={{ display: 'flex', gap: '4px', marginLeft: 4 }} onClick={e => e.stopPropagation()}>
              <button
                type="button"
                title={isFixed ? 'Add subcategory' : 'Edit'}
                onClick={() => isFixed ? openCatAdd(cat.id) : openCatEdit(cat)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#6b7280' }}
              >
                {isFixed ? <Plus size={13} /> : <Edit2 size={12} />}
              </button>
              {!isFixed && (
                <button type="button" title="Delete" onClick={() => deleteCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#ef4444' }}>
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          )}
        </div>
        {children.length > 0 && expanded[cat.id] && children.map(sub => renderCatRow(sub, depth + 1))}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
        {(['items', 'option-groups'] as const).map(t => (
          <button key={t} type="button" onClick={() => setSubTab(t)} style={{ padding: '6px 18px', borderRadius: '8px', border: '1px solid', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.15s', background: subTab === t ? '#111827' : '#fff', color: subTab === t ? '#fff' : '#374151', borderColor: subTab === t ? '#111827' : '#d1d5db' }}>
            {t === 'items' ? 'Menu Items' : 'Option Groups'}
          </button>
        ))}
      </div>

      {/* ── OPTION GROUPS TAB ── */}
      {subTab === 'option-groups' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
          <div>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700 }}>Option Groups</h3>
            {optionGroups.length === 0
              ? <p style={{ color: '#9ca3af' }}>No option groups yet.</p>
              : optionGroups.map(g => (
                <div key={g.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      <strong>{g.nameJa}</strong>
                      <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>{g.nameEn}</span>
                      <span style={badge(g.type === 'RADIO' ? '#dbeafe' : '#fce7f3', g.type === 'RADIO' ? '#1e40af' : '#9d174d')}>{g.type}</span>
                      {g.required && <span style={badge('#fee2e2', '#991b1b')}>必須</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => ogEdit(g)} style={{ padding: '3px 10px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '5px', background: '#fff', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => ogDelete(g.id)} style={{ padding: '3px 10px', fontSize: '0.8rem', border: '1px solid #fca5a5', borderRadius: '5px', background: '#fee2e2', color: '#ef4444', cursor: 'pointer' }}>Delete</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {g.options.map(o => (
                      <span key={o.id} style={{ fontSize: '0.8rem', padding: '2px 9px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '9999px' }}>
                        {o.nameJa}{o.priceAdjust ? ` (+¥${o.priceAdjust})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          <div>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700 }}>{ogForm.id ? 'Edit' : 'New'} Option Group</h3>
            <form onSubmit={ogSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={lbl}>表示名（日本語）<input required value={ogForm.nameJa} onChange={e => setOgForm(f => ({ ...f, nameJa: e.target.value }))} style={inp} placeholder="例：辛さ" /></label>
                <label style={lbl}>Name (English)<input required value={ogForm.nameEn} onChange={e => setOgForm(f => ({ ...f, nameEn: e.target.value }))} style={inp} placeholder="e.g. Spice Level" /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '10px' }}>
                <label style={lbl}>Type
                  <select value={ogForm.type} onChange={e => setOgForm(f => ({ ...f, type: e.target.value }))} style={inp}>
                    <option value="RADIO">Single choice (RADIO)</option>
                    <option value="CHECKBOX">Multi-choice (CHECKBOX)</option>
                  </select>
                </label>
                <label style={lbl}>Required?
                  <select value={String(ogForm.required)} onChange={e => setOgForm(f => ({ ...f, required: e.target.value === 'true' }))} style={inp}>
                    <option value="true">Required 必須</option>
                    <option value="false">Optional 任意</option>
                  </select>
                </label>
                <label style={lbl}>Order<input type="number" min={0} value={ogForm.sortOrder} onChange={e => setOgForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} style={inp} /></label>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Choices</div>
                {ogForm.options.map((opt, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 70px 30px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                    <input placeholder="id (slug)" value={opt.id} onChange={e => ogUpdateChoice(i, 'id', e.target.value.replace(/\s+/g, '-').toLowerCase())} style={{ ...inp, padding: '5px 8px', fontSize: '0.78rem' }} />
                    <input placeholder="日本語名" value={opt.nameJa} onChange={e => ogUpdateChoice(i, 'nameJa', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: '0.78rem' }} />
                    <input placeholder="English" value={opt.nameEn} onChange={e => ogUpdateChoice(i, 'nameEn', e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: '0.78rem' }} />
                    <input type="number" placeholder="±¥" value={opt.priceAdjust} onChange={e => ogUpdateChoice(i, 'priceAdjust', Number(e.target.value))} style={{ ...inp, padding: '5px 8px', fontSize: '0.78rem' }} />
                    <button type="button" onClick={() => ogRemoveChoice(i)} style={{ background: '#fee2e2', border: 'none', borderRadius: '5px', color: '#ef4444', cursor: 'pointer', padding: '4px 6px', fontSize: '1rem' }}>×</button>
                  </div>
                ))}
                <button type="button" onClick={ogAddChoice} style={{ fontSize: '0.82rem', padding: '4px 12px', border: '1px dashed #d1d5db', borderRadius: '6px', background: '#fff', color: '#6b7280', cursor: 'pointer', marginTop: '4px' }}>+ Add choice</button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={ogSaving} style={{ flex: 1, padding: '0.6rem', background: '#111827', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>{ogForm.id ? 'Update' : 'Create'}</button>
                {ogForm.id && <button type="button" onClick={ogReset} style={{ padding: '0.6rem 1rem', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MENU ITEMS TAB ── */}
      {subTab === 'items' && (
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

          {/* Category sidebar */}
          <div style={{ width: '280px', flexShrink: 0, background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', padding: '1.25rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', marginBottom: '0.75rem', letterSpacing: '-0.2px' }}>Categories</div>

            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.75rem' }}>
              {rootCats.length === 0
                ? <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No categories yet.</p>
                : rootCats.map(c => renderCatRow(c))}
            </div>

            {/* Category add/edit form */}
            {catForm.open ? (
              <form onSubmit={saveCat} style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.8rem', color: '#374151' }}>
                  <span>{catForm.id ? 'Edit category' : 'New category'}</span>
                  {(catForm.nameJa || catForm.nameEn) && (
                    <span style={{ fontSize: '1rem' }} title="Category Icon">{getCategoryIcon(catForm.nameJa, catForm.nameEn)}</span>
                  )}
                </div>
                {!catForm.id && (
                  <select value={catForm.parentId} onChange={e => setCatForm(f => ({ ...f, parentId: e.target.value }))} style={{ ...inp, padding: '0.45rem' }}>
                    <option value="">No parent (root)</option>
                    {rootCats.map(c => <option key={c.id} value={c.id}>{c.nameEn}</option>)}
                  </select>
                )}
                <input ref={catInputRef} required placeholder="English name" value={catForm.nameEn} onChange={e => setCatForm(f => ({ ...f, nameEn: e.target.value }))} style={{ ...inp, padding: '0.45rem' }} />
                <input placeholder="日本語名（省略可）" value={catForm.nameJa} onChange={e => setCatForm(f => ({ ...f, nameJa: e.target.value }))} style={{ ...inp, padding: '0.45rem' }} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" style={{ flex: 1, padding: '0.45rem', background: '#111827', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Save</button>
                  <button type="button" onClick={closeCatForm} style={{ padding: '0.45rem 0.75rem', background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                </div>
              </form>
            ) : (
              <button type="button" onClick={() => openCatAdd()} style={{ width: '100%', padding: '0.6rem', border: '1px dashed #d1d5db', borderRadius: '8px', background: '#fff', color: '#6b7280', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                <Plus size={14} /> Add category
              </button>
            )}
          </div>

          {/* Main panel */}
          <div style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '1.5rem' }}>

            {/* Header */}
            {!isEditing && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#111827' }}>{selectedCat?.nameEn ?? 'Select a category'}</h2>
                  {selectedCat && (
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}</span>
                      {filteredItems.length > 1 && !search.trim() && (
                        <span style={{ fontSize: '0.78rem', color: '#8b4513', background: '#faebd7', border: '1px solid #f2d2b6', borderRadius: '20px', padding: '2px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                          <GripVertical size={13} /> ドラッグで並び替え可能 (Drag to reorder)
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="search" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, width: '180px', padding: '0.45rem 0.75rem' }} />
                  <button type="button" id="menu-import-open" onClick={() => setImportOpen(true)} title="CSV / Excel からインポート" style={{ padding: '0.55rem 1rem', background: '#15803d', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <FileSpreadsheet size={15} /> Import / サンプル雛形
                  </button>
                  {selectedCat && (
                    <button type="button" onClick={openAdd} style={{ padding: '0.55rem 1.1rem', background: '#111827', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}>
                      <Plus size={15} /> Add item
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Form header */}
            {isEditing && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>{form.id ? 'Edit Item' : 'Add New Item'}</h2>
                <button type="button" onClick={closeForm} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 500, color: '#4b5563' }}><X size={15} /> Cancel</button>
              </div>
            )}

            {/* Master Ordering System Banner */}
            {!isEditing && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 16px', background: orderingEnabled ? '#f0fdf4' : '#fef2f2', border: `1px solid ${orderingEnabled ? '#bbf7d0' : '#fecaca'}`, borderRadius: '10px', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.3rem' }}>{orderingEnabled ? '🟢' : '🔴'}</span>
                  <div>
                    <strong style={{ fontSize: '0.92rem', color: orderingEnabled ? '#166534' : '#991b1b', display: 'block' }}>
                      Online Ordering System: {orderingEnabled ? 'ON (注文受付中)' : 'OFF (注文受付停止中)'}
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: orderingEnabled ? '#15803d' : '#b91c1c' }}>
                      {orderingEnabled
                        ? 'Website customers can see order buttons on food cards.'
                        : 'Ordering is turned OFF. All order buttons are hidden on food cards.'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleMasterOrdering}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${orderingEnabled ? '#bbf7d0' : '#fca5a5'}`,
                    background: '#fff',
                    color: orderingEnabled ? '#b91c1c' : '#15803d',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  {orderingEnabled ? 'Turn OFF Ordering (注文ボタン非表示)' : 'Turn ON Ordering (注文ボタン表示)'}
                </button>
              </div>
            )}

            {/* Fulfillment & Availability Filters */}
            {!isEditing && selectedCat && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '1.25rem', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginRight: '4px' }}>注文対象絞り込み:</span>
                {[
                  { key: 'all' as const, label: `すべて (${catItems.length})`, color: '#334155', bg: '#f1f5f9' },
                  { key: 'takeout' as const, label: `🛍️ テイクアウト対象 (${takeoutCount})`, color: '#c2410c', bg: '#fff7ed' },
                  { key: 'dine_in' as const, label: `🍽️ 店内対象 (${dineInCount})`, color: '#1d4ed8', bg: '#eff6ff' },
                  { key: 'lunch' as const, label: `🍱 ランチ (${lunchCount})`, color: '#b45309', bg: '#fef3c7' },
                  { key: 'sold_out' as const, label: `❌ 売り切れ (${soldOutCount})`, color: '#b91c1c', bg: '#fee2e2' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFulfillmentFilter(tab.key)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '9999px',
                      fontSize: '0.78rem',
                      fontWeight: fulfillmentFilter === tab.key ? 700 : 500,
                      cursor: 'pointer',
                      border: fulfillmentFilter === tab.key ? `1.5px solid ${tab.color}` : '1px solid #cbd5e1',
                      background: fulfillmentFilter === tab.key ? tab.bg : '#fff',
                      color: fulfillmentFilter === tab.key ? tab.color : '#64748b',
                      transition: 'all 0.12s',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Item list */}
            {!isEditing && !selectedCat && (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Select a category to manage its items.</div>
            )}

            {!isEditing && selectedCat && filteredItems.length === 0 && (
              <div style={{ padding: '2.5rem', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db' }}>
                <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>{search ? 'No items match your search.' : 'No items in this category yet.'}</p>
                {!search && <button type="button" onClick={openAdd} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontWeight: 500, color: '#374151' }}>Add the first item</button>}
              </div>
            )}

            {!isEditing && filteredItems.map((item, itemIndex) => {
              const canDrag = !search.trim() && filteredItems.length > 1;
              const isDragged = draggedItemId === item.id;
              const isDropTarget = dragOverItemId === item.id;

              return (
                <div
                  key={item.id}
                  draggable={canDrag}
                  onDragStart={e => handleItemDragStart(e, item)}
                  onDragOver={e => handleItemDragOver(e, item)}
                  onDragLeave={e => handleItemDragLeave(e, item)}
                  onDrop={e => handleItemDrop(e, item)}
                  onDragEnd={handleItemDragEnd}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    padding: '1.15rem 1.25rem',
                    background: isDragged
                      ? '#f3f4f6'
                      : isDropTarget
                      ? '#fffbeb'
                      : item.isActive
                      ? '#f9fafb'
                      : '#fdf2f2',
                    opacity: isDragged ? 0.45 : 1,
                    borderRadius: '12px',
                    border: `1px solid ${item.isActive ? '#e5e7eb' : '#fca5a5'}`,
                    borderTop:
                      isDropTarget && dragOverItemPosition === 'before'
                        ? '3px solid #8b4513'
                        : `1px solid ${item.isActive ? '#e5e7eb' : '#fca5a5'}`,
                    borderBottom:
                      isDropTarget && dragOverItemPosition === 'after'
                        ? '3px solid #8b4513'
                        : `1px solid ${item.isActive ? '#e5e7eb' : '#fca5a5'}`,
                    marginBottom: '0.75rem',
                    alignItems: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: isDragged ? '0 8px 16px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {/* Drag Handle & Order Controls */}
                  {canDrag && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px',
                        flexShrink: 0,
                        color: '#9ca3af',
                        userSelect: 'none',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => moveItem(item, 'up')}
                        disabled={itemIndex === 0}
                        title="上に移動 (Move up)"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: itemIndex === 0 ? 'default' : 'pointer',
                          opacity: itemIndex === 0 ? 0.2 : 0.7,
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          color: '#4b5563',
                        }}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <div
                        title="ドラッグして並び替え (Drag to reorder)"
                        style={{
                          cursor: 'grab',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          padding: '2px',
                        }}
                      >
                        <GripVertical size={18} style={{ color: '#8b4513' }} />
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#8b4513' }}>
                          #{itemIndex + 1}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => moveItem(item, 'down')}
                        disabled={itemIndex === filteredItems.length - 1}
                        title="下に移動 (Move down)"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: itemIndex === filteredItems.length - 1 ? 'default' : 'pointer',
                          opacity: itemIndex === filteredItems.length - 1 ? 0.2 : 0.7,
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          color: '#4b5563',
                        }}
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  )}

                  {item.imageUrl
                    ? (
                      <img
                        src={assetUrl(item.imageUrl) || '/bg-hero-img.webp'}
                        alt={item.nameEn}
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.src.endsWith('/bg-hero-img.webp')) {
                            target.src = '/bg-hero-img.webp';
                          }
                        }}
                        style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                      />
                    )
                    : <div style={{ width: '90px', height: '90px', background: '#e5e7eb', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.75rem' }}>No image</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827' }}>{item.nameEn}</span>
                        {item.nameJa && <span style={{ marginLeft: '6px', color: '#6b7280', fontSize: '0.85rem' }}>{item.nameJa}</span>}
                      </div>
                      <span style={{ fontWeight: 700, color: '#8b4513', fontSize: '1.05rem', whiteSpace: 'nowrap' }}>¥{item.price.toLocaleString()}</span>
                    </div>
                    {item.descriptionEn && <p style={{ margin: '4px 0 6px', color: '#6b7280', fontSize: '0.85rem', lineHeight: 1.4 }}>{item.descriptionEn}</p>}
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {item.menuTypes.includes('TAKEOUT') ? (
                        <span style={badge('#fff7ed', '#c2410c')}>🛍️ 持帰OK</span>
                      ) : (
                        <span style={badge('#f3f4f6', '#9ca3af')}>🛍️ 持帰✕</span>
                      )}
                      {(item.menuTypes.includes('GRAND') || item.menuTypes.includes('LUNCH')) ? (
                        <span style={badge('#eff6ff', '#1d4ed8')}>🍽️ 店内OK</span>
                      ) : (
                        <span style={badge('#f3f4f6', '#9ca3af')}>🍽️ 店内✕</span>
                      )}
                      {item.menuTypes.includes('LUNCH') && (
                        <span style={badge('#fef3c7', '#b45309')}>🍱 ランチ</span>
                      )}
                      {item.spiceLevel > 0 && <span style={{ fontSize: '0.78rem' }}>{spiceIcon(item.spiceLevel)}</span>}
                      {!item.isActive && <span style={badge('#fee2e2', '#b91c1c')}>Hidden</span>}
                      {item.isOrderable === false && <span style={badge('#fee2e2', '#991b1b')}>Order OFF</span>}
                      {item.isSoldOut && <span style={badge('#fee2e2', '#b91c1c')}>Sold out</span>}
                      {item.isRecommended && <span style={badge('#fef3c7', '#d97706')}>⭐ Recommended</span>}
                      {item.isVegetarian && <span style={badge('#d1fae5', '#059669')}>🌿 Veg</span>}
                      {item.isVegan && <span style={badge('#dcfce7', '#16a34a')}>🌱 Vegan</span>}
                      {item.isHalal && <span style={badge('#fce7f3', '#9d174d')}>Halal</span>}
                      {item.isGlutenFree && <span style={badge('#e0e7ff', '#4f46e5')}>GF</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
                    <button type="button" onClick={() => openEdit(item)} style={{ padding: '0.35rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', color: '#374151' }}>Edit</button>
                    <button type="button" onClick={() => toggleTakeout(item)} title="テイクアウト注文での表示/非表示を即座に切り替え" style={{ padding: '0.35rem 0.75rem', border: '1px solid', borderColor: item.menuTypes.includes('TAKEOUT') ? '#fed7aa' : '#e5e7eb', borderRadius: '6px', background: item.menuTypes.includes('TAKEOUT') ? '#fff7ed' : '#f9fafb', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', color: item.menuTypes.includes('TAKEOUT') ? '#c2410c' : '#9ca3af' }}>{item.menuTypes.includes('TAKEOUT') ? '🛍️ 持帰: ON' : '🛍️ 持帰: OFF'}</button>
                    <button type="button" onClick={() => toggleDineIn(item)} title="店内注文での表示/非表示を即座に切り替え" style={{ padding: '0.35rem 0.75rem', border: '1px solid', borderColor: (item.menuTypes.includes('GRAND') || item.menuTypes.includes('LUNCH')) ? '#bfdbfe' : '#e5e7eb', borderRadius: '6px', background: (item.menuTypes.includes('GRAND') || item.menuTypes.includes('LUNCH')) ? '#eff6ff' : '#f9fafb', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', color: (item.menuTypes.includes('GRAND') || item.menuTypes.includes('LUNCH')) ? '#1d4ed8' : '#9ca3af' }}>{(item.menuTypes.includes('GRAND') || item.menuTypes.includes('LUNCH')) ? '🍽️ 店内: ON' : '🍽️ 店内: OFF'}</button>
                    <button type="button" onClick={() => toggleOrderable(item)} style={{ padding: '0.35rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: item.isOrderable !== false ? '#ecfdf5' : '#fef2f2', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', color: item.isOrderable !== false ? '#065f46' : '#991b1b' }}>{item.isOrderable !== false ? 'Order: ON' : 'Order: OFF'}</button>
                    <button type="button" onClick={() => toggleSoldOut(item)} style={{ padding: '0.35rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.8rem', color: item.isSoldOut ? '#059669' : '#b45309' }}>{item.isSoldOut ? 'In stock' : 'Sold out'}</button>
                    <button type="button" onClick={() => toggleActive(item)} style={{ padding: '0.35rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.8rem', color: item.isActive ? '#6b7280' : '#059669' }}>{item.isActive ? 'Hide' : 'Show'}</button>
                    <button type="button" onClick={() => deleteItem(item.id)} style={{ padding: '0.35rem 0.75rem', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fee2e2', cursor: 'pointer', fontWeight: 500, fontSize: '0.8rem', color: '#ef4444' }}>Delete</button>
                  </div>
                </div>
              );
            })}

            {/* ── Add / Edit form ── */}
            {isEditing && (
              <form onSubmit={handleSaveItem} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

                {/* Image */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Item image
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {form.imageUrl && (
                        <img
                          src={assetUrl(form.imageUrl) || '/bg-hero-img.webp'}
                          alt="preview"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.src.endsWith('/bg-hero-img.webp')) {
                              target.src = '/bg-hero-img.webp';
                            }
                          }}
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb', flexShrink: 0 }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <input type="file" accept="image/*" onChange={handleUpload} style={{ ...inp, padding: '0.4rem' }} />
                        {uploading && <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Uploading…</div>}
                        {form.imageUrl && !uploading && <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '4px' }}>✓ Image ready</div>}
                      </div>
                    </div>
                  </label>
                </div>

                {/* Name EN */}
                <label style={lbl}>Food name (English) *
                  <input required value={form.nameEn} onChange={e => set({ nameEn: e.target.value })} style={inp} placeholder="e.g. Butter Chicken Curry" />
                </label>

                {/* Name JA */}
                <label style={lbl}>料理名（日本語）
                  <input value={form.nameJa} onChange={e => set({ nameJa: e.target.value })} style={inp} placeholder="例：バターチキンカレー" />
                </label>

                {/* Category */}
                <label style={lbl}>Category *
                  <select
                    required
                    value={form.categoryId}
                    onChange={e => {
                      const newCatId = e.target.value;
                      const curCat = categories.find(c => c.id === newCatId);
                      const catName = (curCat?.nameEn || '').toLowerCase();
                      const parentCat = curCat?.parentId ? categories.find(p => p.id === curCat.parentId) : null;
                      const parentName = (parentCat?.nameEn || '').toLowerCase();
                      const combined = `${parentName} ${catName}`;
                      
                      let nextMenuTypes = [...form.menuTypes];
                      if (nextMenuTypes.length === 0) {
                        if (combined.includes('lunch')) nextMenuTypes.push('LUNCH');
                        if (combined.includes('takeout')) nextMenuTypes.push('TAKEOUT');
                        if (combined.includes('grand')) nextMenuTypes.push('GRAND');
                      }
                      set({ categoryId: newCatId, menuTypes: nextMenuTypes });
                    }}
                    style={inp}
                  >
                    <option value="">— select —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
                  </select>
                </label>

                {/* Price */}
                <label style={lbl}>Price (¥) *
                  <input required type="number" min={0} value={form.price} onChange={e => set({ price: e.target.value })} style={inp} placeholder="1200" />
                </label>

                {/* Description EN */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Description (English)
                    <textarea value={form.descriptionEn} onChange={e => set({ descriptionEn: e.target.value })} style={{ ...inp, minHeight: '70px', resize: 'vertical' }} placeholder="Creamy tomato-based chicken curry…" />
                  </label>
                </div>

                {/* Description JA */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>説明文（日本語）
                    <textarea value={form.descriptionJa} onChange={e => set({ descriptionJa: e.target.value })} style={{ ...inp, minHeight: '70px', resize: 'vertical' }} placeholder="クリーミーなトマトベースのカレーです…" />
                  </label>
                </div>

                {/* Menu types */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ ...lbl, marginBottom: '8px' }}>Appears on menu(s) / 注文受付種別</div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {MENU_TYPES.map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', padding: '8px 16px', border: `1.5px solid ${form.menuTypes.includes(t) ? (t === 'TAKEOUT' ? '#ea580c' : '#1d4ed8') : '#d1d5db'}`, borderRadius: '8px', background: form.menuTypes.includes(t) ? (t === 'TAKEOUT' ? '#fff7ed' : '#eff6ff') : '#fff', color: form.menuTypes.includes(t) ? (t === 'TAKEOUT' ? '#c2410c' : '#1e40af') : '#4b5563', transition: 'all 0.12s' }}>
                        <input type="checkbox" checked={form.menuTypes.includes(t)} onChange={e => set({ menuTypes: e.target.checked ? [...form.menuTypes, t] : form.menuTypes.filter(x => x !== t) })} style={{ display: 'none' }} />
                        {t === 'TAKEOUT' ? '🛍️ テイクアウト (Takeout / 8% 軽減税率)' : t === 'LUNCH' ? '🍱 ランチセット (Lunch Set / 店内限定)' : '🍽️ 店内飲食 (Dine-In / 10% 標準税率)'}
                      </label>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                    ※ テイクアウトにチェックを入れるとお持ち帰り注文画面に表示されます。ランチセット等はテイクアウト時には自動的に非表示になります。
                  </p>
                </div>

                {/* Spice level */}
                <div>
                  <div style={{ ...lbl, marginBottom: '8px' }}>Spice level</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {[0, 1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" onClick={() => set({ spiceLevel: n })} style={{ width: '36px', height: '36px', borderRadius: '8px', border: `2px solid ${form.spiceLevel === n ? '#111827' : '#d1d5db'}`, background: form.spiceLevel === n ? '#111827' : '#fff', color: form.spiceLevel === n ? '#fff' : '#374151', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                        {n === 0 ? '0' : '🌶'.repeat(n)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating */}
                <label style={lbl}>Rating (1–5, optional)
                  <input type="number" step="0.1" min="1" max="5" value={form.rating} onChange={e => set({ rating: e.target.value })} style={inp} placeholder="4.5" />
                </label>

                {/* Dietary flags */}
                <div style={{ gridColumn: '1 / -1', padding: '1rem', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                  <div style={{ ...lbl, marginBottom: '10px' }}>Dietary &amp; flags</div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {([
                      ['isRecommended', '⭐ Recommended'],
                      ['isOrderable', '🛒 Online Ordering (Show order button in food card)'],
                      ['isVegetarian', '🌿 Vegetarian'],
                      ['isVegan', '🌱 Vegan'],
                      ['isHalal', '🥩 Halal'],
                      ['isGlutenFree', 'Gluten Free'],
                      ['isSoldOut', '❌ Sold Out'],
                      ['isActive', '✅ Visible'],
                    ] as [keyof typeof form, string][]).map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}>
                        <input type="checkbox" checked={Boolean(form[key])} onChange={e => set({ [key]: e.target.checked } as any)} style={{ width: '15px', height: '15px', accentColor: '#111827' }} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Allergens */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ ...lbl, marginBottom: '8px' }}>Allergens</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {ALLERGEN_LIST.map(a => {
                      const on = form.allergens.includes(a);
                      return (
                        <button key={a} type="button" onClick={() => set({ allergens: on ? form.allergens.filter(x => x !== a) : [...form.allergens, a] })} style={{ padding: '3px 10px', borderRadius: '9999px', border: `1px solid ${on ? '#111827' : '#d1d5db'}`, background: on ? '#111827' : '#fff', color: on ? '#fff' : '#6b7280', fontSize: '0.78rem', cursor: 'pointer', fontWeight: on ? 600 : 400 }}>
                          {a}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={form.newAllergen} onChange={e => set({ newAllergen: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (form.newAllergen.trim() && !form.allergens.includes(form.newAllergen.trim())) set({ allergens: [...form.allergens, form.newAllergen.trim()], newAllergen: '' }); } }} style={{ ...inp, flex: 1 }} placeholder="Custom allergen (press Enter to add)" />
                    <button type="button" onClick={() => { if (form.newAllergen.trim() && !form.allergens.includes(form.newAllergen.trim())) set({ allergens: [...form.allergens, form.newAllergen.trim()], newAllergen: '' }); }} style={{ padding: '0.6rem 1rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}>Add</button>
                  </div>
                  {form.allergens.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
                      {form.allergens.map(a => (
                        <span key={a} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '9999px', background: '#f3f4f6', border: '1px solid #d1d5db', fontSize: '0.78rem' }}>
                          {a}
                          <button type="button" onClick={() => set({ allergens: form.allergens.filter(x => x !== a) })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9ca3af', lineHeight: 1 }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Option groups */}
                {optionGroups.length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ ...lbl, marginBottom: '8px' }}>Link option groups <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '0.75rem' }}>(customisations shown to the customer)</span></div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                      {optionGroups.map(g => {
                        const on = form.optionGroupIds.includes(g.id);
                        return (
                          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '9999px', border: `1.5px solid ${on ? '#4f46e5' : '#d1d5db'}`, background: on ? '#eef2ff' : '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: on ? 700 : 400, transition: 'all 0.12s' }}>
                            <input type="checkbox" checked={on} onChange={e => set({ optionGroupIds: e.target.checked ? [...form.optionGroupIds, g.id] : form.optionGroupIds.filter(id => id !== g.id) })} style={{ display: 'none' }} />
                            {g.nameJa}
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>({g.type})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Submit */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
                  <button type="button" onClick={closeForm} style={{ padding: '0.7rem 1.25rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 500, color: '#4b5563' }}>Cancel</button>
                  <button type="submit" disabled={saving || uploading} style={{ padding: '0.7rem 1.75rem', background: saving ? '#6b7280' : '#111827', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}>
                    {saving ? 'Saving…' : form.id ? 'Update item' : 'Add item'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {importOpen && (
        <MenuImportModal
          targetCategoryId={selectedCatId}
          categories={categories}
          onClose={() => setImportOpen(false)}
          onImported={fetchAll}
        />
      )}
    </div>
  );
}
